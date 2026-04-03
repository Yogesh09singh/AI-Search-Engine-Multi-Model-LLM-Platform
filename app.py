"""
AI Smart Search Engine - Flask Backend with OpenRouter API
Uses multiple free AI models from OpenRouter to search simultaneously
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import sqlite3
import json
import os
import datetime
from pathlib import Path
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
import hashlib

try:
    from google import genai as _genai
    from google.genai import types as _genai_types
    _GENAI_AVAILABLE = True
except ImportError:
    _genai = None
    _genai_types = None
    _GENAI_AVAILABLE = False
    print('[WARN] google-genai not installed; install with: pip install google-genai')

CACHE_TTL_SECONDS = 3600  # 1 hour (increased for better cache hits)

# Load .env file
def load_env_file():
    """Load environment variables from .env file"""
    env_path = Path('.env')
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())

load_env_file()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
DATABASE = 'search_engine.db'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'doc', 'docx', 'md', 'json'}
MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 50 * 1024 * 1024))  # 50MB

# API base URLs
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '').strip()
OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions'
GEMINI_BASE_URL     = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

# Load up to 3 models from .env; fall back to 3 reliable free models
_DEFAULT_MODELS = [
    {'id': 'nvidia/nemotron-3-nano-30b-a3b:free', 'base_url': OPENROUTER_BASE_URL},
    {'id': 'openai/gpt-oss-20b:free',             'base_url': OPENROUTER_BASE_URL},
    {'id': 'gemini-3-flash-preview',      'base_url': GEMINI_BASE_URL},
]
MODEL_CONFIGS = []
for _idx in (1, 2, 3):
    _model_id = os.getenv(f'MODEL_{_idx}', '').strip()
    if not _model_id:
        continue
    _model_key  = os.getenv(f'MODEL_{_idx}_API_KEY',  '').strip() or OPENROUTER_API_KEY
    _model_base = os.getenv(f'MODEL_{_idx}_BASE_URL', '').strip() or OPENROUTER_BASE_URL
    MODEL_CONFIGS.append({
        'id':       _model_id,
        'api_key':  _model_key,
        'base_url': _model_base,
        'slot':     _idx,
    })

if not MODEL_CONFIGS:
    MODEL_CONFIGS = [{
        'id':       d['id'],
        'api_key':  OPENROUTER_API_KEY,
        'base_url': d['base_url'],
        'slot':     i + 1,
    } for i, d in enumerate(_DEFAULT_MODELS)]

FREE_MODELS = [m['id'] for m in MODEL_CONFIGS]
MODEL_KEY_BY_ID  = {m['id']: m['api_key']  for m in MODEL_CONFIGS if m.get('api_key')}
MODEL_BASE_BY_ID = {m['id']: m['base_url'] for m in MODEL_CONFIGS if m.get('base_url')}


def _resolve_model_key(model_id):
    return (MODEL_KEY_BY_ID.get(model_id) or OPENROUTER_API_KEY or '').strip()


def _resolve_model_base_url(model_id):
    return MODEL_BASE_BY_ID.get(model_id) or OPENROUTER_BASE_URL


print(f"[OK] Using {len(FREE_MODELS)} model(s):", ', '.join(FREE_MODELS))

# Create uploads directory
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize TF-IDF vectorizer for semantic search
vectorizer = TfidfVectorizer(max_features=500, lowercase=True, stop_words='english')
tfidf_matrix = None
documents_content = []
print("[OK] Semantic search model initialized successfully")

# Initialize database
def init_db():
    """Initialize SQLite database with required tables"""
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    
    # Documents table
    c.execute('''CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        file_size INTEGER,
        document_type TEXT
    )''')
    
    # Search history table
    c.execute('''CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        model_used TEXT,
        results_count INTEGER,
        response_time REAL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Search analytics table
    c.execute('''CREATE TABLE IF NOT EXISTS search_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        category TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        results_found BOOLEAN,
        user_satisfaction INTEGER,
        click_through_rate REAL
    )''')
    
    # Chats (conversation sessions)
    c.execute('''CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL DEFAULT 'New chat',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Chat messages (for memory and past chats)
    c.execute('''CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Response feedback (thumbs up/down per model)
    c.execute('''CREATE TABLE IF NOT EXISTS response_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_name TEXT NOT NULL,
        helpful INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    # Query cache for same questions
    c.execute('''CREATE TABLE IF NOT EXISTS query_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_hash TEXT UNIQUE NOT NULL,
        response_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    
    conn.commit()
    conn.close()

init_db()

# Helper functions
def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_file(filepath, filename):
    """Extract text from uploaded file"""
    try:
        ext = filename.rsplit('.', 1)[1].lower()
        
        if ext == 'txt' or ext == 'md':
            with open(filepath, 'r', encoding='utf-8') as f:
                return f.read()
        
        elif ext == 'json':
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return json.dumps(data, indent=2)
        
        elif ext in ['doc', 'docx']:
            try:
                import docx
                doc = docx.Document(filepath)
                return '\n'.join([p.text for p in doc.paragraphs])
            except ImportError:
                return "Error: python-docx not installed. Please install it."
        
        elif ext == 'pdf':
            try:
                import PyPDF2
                text = ""
                with open(filepath, 'rb') as f:
                    pdf_reader = PyPDF2.PdfReader(f)
                    for page in pdf_reader.pages:
                        text += page.extract_text()
                return text
            except ImportError:
                return "Error: PyPDF2 not installed. Please install it."
        
        return ""
    except Exception as e:
        return f"Error reading file: {str(e)}"

def generate_embedding(text):
    """Generate semantic embedding using TF-IDF"""
    global vectorizer, tfidf_matrix, documents_content
    try:
        return text[:500]  # Store text preview for analysis
    except Exception as e:
        print(f"Error generating embedding: {e}")
        return None

def similarity_search(query, top_k=5):
    """Perform semantic similarity search using TF-IDF"""
    global vectorizer, tfidf_matrix, documents_content
    
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT id, filename, content FROM documents')
        documents = c.fetchall()
        conn.close()
        
        if not documents:
            return []
        
        # Use full document content for TF-IDF so relevance scoring is accurate
        documents_content = [doc[2] for doc in documents]
        all_texts = documents_content + [query]
        
        vectorizer = TfidfVectorizer(max_features=1000, lowercase=True, stop_words='english', sublinear_tf=True)
        tfidf_matrix = vectorizer.fit_transform(all_texts)
        
        # Calculate similarity between query and documents
        query_vector = tfidf_matrix[-1]
        doc_vectors = tfidf_matrix[:-1]
        similarities = cosine_similarity(query_vector, doc_vectors)[0]
        
        MIN_SCORE = 0.08  # Minimum cosine similarity to be considered relevant
        results = []
        for idx, (doc_id, filename, content) in enumerate(documents):
            score = float(similarities[idx])
            if score >= MIN_SCORE:
                results.append({
                    'id': doc_id,
                    'filename': filename,
                    'content': content[:800],
                    'similarity': round(score, 4)
                })
        
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:top_k]
    except Exception as e:
        print(f"Error in similarity search: {e}")
        return []

# Model info for tooltips (Best for X)
MODEL_INFO = {
    'nvidia/nemotron': 'Best for lightweight reasoning and concise answers',
    'llama':           'Best for fast responses via Groq inference',
    'gemini':          'Best for multimodal and long-context tasks via Google AI',
    'default':         'Best for general search queries',
}

def _get_model_tooltip(model_id):
    for k, v in MODEL_INFO.items():
        if k != 'default' and k in (model_id or ''):
            return v
    return MODEL_INFO['default']


def _is_gemini_model(model_id):
    """Return True if model_id refers to a Google Gemini model."""
    return (model_id or '').lower().startswith('gemini')

def _compute_response_score(resp_text, response_time_ms, token_count, is_error=False):
    """score = (relevance × 0.5) + (structure × 0.3) + (length_balance × 0.2)"""
    if is_error:
        return 0.0
    # Relevance: based on length (not too short, not too long)
    length = len(resp_text.strip())
    relevance = min(1.0, length / 200) if length > 50 else 0.3
    # Structure: has paragraphs, punctuation, varied length
    has_paragraphs = '\n\n' in resp_text or len(resp_text) > 150
    punctuation_ok = sum(1 for c in resp_text if c in '.!?') >= 1
    structure = 0.7 if (has_paragraphs and punctuation_ok) else 0.4
    # Length balance: 100-600 chars ideal
    if 100 <= length <= 600:
        length_balance = 1.0
    elif 50 <= length <= 1000:
        length_balance = 0.8
    else:
        length_balance = 0.6
    score = (relevance * 0.5) + (structure * 0.3) + (length_balance * 0.2)
    return round(score, 2)

def query_gemini_native(model, query, context="", history=None, api_key=None):
    """Query a Gemini model using the official google-genai SDK."""
    start = time.time()
    try:
        effective_api_key = (api_key or _resolve_model_key(model)).strip()
        if not effective_api_key:
            return {
                'model': model, 'status': 'error', 'reason': 'missing_api_key',
                'response': 'Gemini API key missing. Set MODEL_3_API_KEY in .env.',
                'response_time_ms': 0, 'token_count': 0, 'score': 0,
                'tooltip': _get_model_tooltip(model),
            }

        client = _genai.Client(api_key=effective_api_key)

        system_content = (
            "You are a concise search assistant. The user will send a search query or question. "
            "Respond with a direct, informative answer. Do not greet the user or ask how you can help. "
            "Just answer the question in 1-3 short paragraphs. If the query is a greeting, give a one-line friendly reply and invite a real question. "
            "When conversation history is provided, use it for context and continuity."
        )
        user_text = f"{context}\n\nSearch query: {query}" if context else f"Search query: {query}"

        contents = []
        if history:
            for h in (history or [])[-10:]:
                if h.get('role') and h.get('content'):
                    role = 'user' if h['role'] == 'user' else 'model'
                    contents.append(_genai_types.Content(
                        role=role,
                        parts=[_genai_types.Part(text=str(h['content'])[:2000])]
                    ))
        contents.append(_genai_types.Content(
            role='user',
            parts=[_genai_types.Part(text=user_text)]
        ))

        config = _genai_types.GenerateContentConfig(
            system_instruction=system_content,
            temperature=0.5,
            max_output_tokens=500,
        )

        print(f"[API] Calling {model} via google-genai native SDK...")
        response = client.models.generate_content(model=model, contents=contents, config=config)

        elapsed_ms = int((time.time() - start) * 1000)
        text = (response.text or '').strip()
        if not text:
            text = "The model returned an empty response. Please try rephrasing or try again in a moment."

        try:
            usage = response.usage_metadata
            token_count = (getattr(usage, 'candidates_token_count', 0) or 0) + (getattr(usage, 'prompt_token_count', 0) or 0)
        except Exception:
            token_count = 0

        score = _compute_response_score(text, elapsed_ms, token_count, is_error=False)
        return {
            'model': model, 'status': 'success', 'response': text,
            'response_time_ms': elapsed_ms, 'token_count': token_count,
            'score': score, 'tooltip': _get_model_tooltip(model),
            'creativity': round(min(1.0, len(text) / 400) * 100),
            'readability': round(min(100, 50 + len([c for c in text if c in '.!?\n']) * 5)),
        }
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        err = str(e)
        print(f"[API] Gemini native SDK error: {err}")
        if 'API_KEY_INVALID' in err or 'invalid api key' in err.lower():
            friendly = 'Invalid Gemini API key. Check MODEL_3_API_KEY in .env.'
            reason = 'invalid_api_key'
        elif 'quota' in err.lower() or 'rate' in err.lower() or '429' in err:
            friendly = 'Gemini rate limit reached. Wait a moment and try again.'
            reason = 'rate_limit'
        else:
            friendly = f'Gemini error: {err[:200]}'
            reason = 'error'
        return {
            'model': model, 'status': 'error', 'reason': reason,
            'response': friendly, 'response_time_ms': elapsed_ms,
            'token_count': 0, 'score': 0, 'tooltip': _get_model_tooltip(model),
        }


def query_openrouter_model(model, query, context="", history=None, api_key=None, base_url=None):
    """Query a single AI model (OpenRouter or Groq). Returns dict with response_time_ms, tokens, tooltip."""
    # Route Gemini models to the native google-genai SDK
    if _is_gemini_model(model) and _GENAI_AVAILABLE:
        return query_gemini_native(model, query, context, history, api_key)
    if _is_gemini_model(model) and not _GENAI_AVAILABLE:
        return {
            'model': model, 'status': 'error', 'reason': 'missing_sdk',
            'response': 'google-genai SDK not installed. Run: pip install google-genai',
            'response_time_ms': 0, 'token_count': 0, 'score': 0,
            'tooltip': _get_model_tooltip(model),
        }

    start = time.time()
    try:
        effective_api_key = (api_key or _resolve_model_key(model)).strip()
        effective_base_url = (base_url or _resolve_model_base_url(model)).strip()
        if not effective_api_key:
            return {
                'model': model,
                'status': 'error',
                'reason': 'missing_api_key',
                'response': 'API key missing for this model. Set OPENROUTER_API_KEY or MODEL_X_API_KEY in .env.',
                'response_time_ms': 0,
                'token_count': 0,
                'score': 0,
                'tooltip': _get_model_tooltip(model),
            }

        is_groq = 'groq.com' in effective_base_url
        headers = {
            'Authorization': f'Bearer {effective_api_key}',
            'Content-Type': 'application/json',
        }
        if not is_groq:
            headers['HTTP-Referer'] = 'http://localhost:8000'
            headers['X-Title'] = 'AI Search Engine'

        system_content = (
            "You are a concise search assistant. The user will send a search query or question. "
            "Respond with a direct, informative answer. Do not greet the user or ask how you can help. "
            "Just answer the question in 1-3 short paragraphs. If the query is a greeting, give a one-line friendly reply and invite a real question. "
            "When conversation history is provided, use it for context and continuity."
        )
        user_content = f"{context}\n\nSearch query: {query}" if context else f"Search query: {query}"

        messages = [{'role': 'system', 'content': system_content}]
        if history:
            for h in history[-10:]:  # last 10 exchanges
                if h.get('role') and h.get('content'):
                    messages.append({'role': h['role'], 'content': str(h['content'])[:2000]})
        messages.append({'role': 'user', 'content': user_content})

        payload = {
            'model': model,
            'messages': messages,
            'temperature': 0.5,
            'max_tokens': 500
        }

        print(f"[API] Calling {model} via {effective_base_url}...")
        response = requests.post(effective_base_url, json=payload, headers=headers, timeout=12)

        # Retry once on transient statuses only
        if response.status_code in (429, 502, 503, 504):
            time.sleep(1)
            print(f"[API] Retrying {model} after {response.status_code}...")
            response = requests.post(effective_base_url, json=payload, headers=headers, timeout=12)

        if response.status_code != 200:
            print(f"[API] Response status: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            elapsed_ms = int((time.time() - start) * 1000)
            try:
                content = (data.get('choices') or [{}])[0].get('message') or {}
                text = (content.get('content') or '').strip()
            except (IndexError, KeyError, TypeError):
                text = ''
            if not text:
                print("[API] OpenRouter returned 200 but empty content; response keys:", list(data.keys()) if isinstance(data, dict) else 'not dict')
                text = "The model returned an empty response. Please try rephrasing or try again in a moment."
            usage = data.get('usage', {}) or {}
            token_count = (usage.get('completion_tokens') or 0) + (usage.get('prompt_tokens') or 0)
            score = _compute_response_score(text, elapsed_ms, token_count, is_error=False)
            return {
                'model': model,
                'status': 'success',
                'response': text,
                'tokens': usage,
                'response_time_ms': elapsed_ms,
                'token_count': token_count,
                'score': score,
                'tooltip': _get_model_tooltip(model),
                'creativity': round(min(1.0, len(text) / 400) * 100),
                'readability': round(min(100, 50 + len([c for c in text if c in '.!?\n']) * 5)),
            }
        else:
            try:
                error_data = response.json()
                error_msg = error_data.get('error', {}).get('message', str(response.text[:200]))
            except Exception:
                error_msg = response.text[:200] if response.text else f'HTTP {response.status_code}'

            print(f"[API] Error response: {error_msg}")

            # User-friendly message and reason code for common free-tier issues
            lower_error_msg = (error_msg or '').lower()

            if response.status_code == 429:
                friendly = "Rate limit reached — free models allow 20 requests/min and 200/day. Wait a moment and try again."
                reason = 'rate_limit'
            elif response.status_code == 404 and ('guardrail restrictions' in lower_error_msg or 'data policy' in lower_error_msg):
                friendly = (
                    "This model is blocked by your OpenRouter privacy policy settings. "
                    "Update settings at https://openrouter.ai/settings/privacy and allow compatible providers."
                )
                reason = 'privacy_policy'
            elif response.status_code == 400:
                friendly = "This free model is temporarily unavailable from its provider. Try again in a moment."
                reason = 'unavailable'
            else:
                friendly = f"Error {response.status_code}: {error_msg[:150]}"
                reason = 'error'

            elapsed_ms = int((time.time() - start) * 1000)
            return {
                'model': model,
                'status': 'error',
                'reason': reason,
                'response': friendly,
                'error': response.text,
                'response_time_ms': elapsed_ms,
                'token_count': 0,
                'score': 0,
                'tooltip': _get_model_tooltip(model),
            }
    except Exception as e:
        print(f"[API] Exception: {str(e)}")
        elapsed_ms = int((time.time() - start) * 1000)
        return {
            'model': model,
            'status': 'error',
            'response': str(e),
            'response_time_ms': elapsed_ms,
            'token_count': 0,
            'score': 0,
            'tooltip': _get_model_tooltip(model),
        }

def query_multiple_models_simultaneously(query, context="", history=None, model_configs=None):
    """Query multiple models simultaneously. history = list of {role, content} for chat memory."""
    results = []
    history = history or []
    model_configs = model_configs or MODEL_CONFIGS
    
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(
                query_openrouter_model,
                cfg['id'], query, context, history,
                cfg.get('api_key'), cfg.get('base_url')
            ): cfg['id']
            for cfg in model_configs
        }
        
        for future in as_completed(futures):
            try:
                result = future.result()
                if 'tooltip' not in result:
                    result['tooltip'] = _get_model_tooltip(result.get('model'))
                if 'response_time_ms' not in result:
                    result['response_time_ms'] = 0
                if 'token_count' not in result:
                    result['token_count'] = 0
                if 'score' not in result and result.get('status') == 'success':
                    result['score'] = _compute_response_score(
                        result.get('response', ''), result.get('response_time_ms', 0),
                        result.get('token_count', 0), is_error=False
                    )
                if 'creativity' not in result and result.get('status') == 'success':
                    text = result.get('response', '')
                    result['creativity'] = round(min(100, len(text) / 4))
                    result['readability'] = round(min(100, 50 + len([c for c in text if c in '.!?\n']) * 5))
                results.append(result)
            except Exception as e:
                model = futures[future]
                results.append({
                    'model': model,
                    'status': 'error',
                    'response': str(e),
                    'tooltip': _get_model_tooltip(model),
                    'response_time_ms': 0,
                    'token_count': 0,
                    'score': 0,
                })
    
    # Sort by score (best first), then by response_time
    results.sort(key=lambda r: (r.get('score', 0), -r.get('response_time_ms', 0)), reverse=True)
    return results

# Serve static files
@app.route('/')
def serve_index():
    """Serve the main index.html file"""
    try:
        with open('index.html', 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/styles.css')
def serve_styles():
    """Serve CSS file"""
    try:
        with open('styles.css', 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/css'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/engine.js')
def serve_engine():
    """Serve JavaScript engine file"""
    try:
        with open('engine.js', 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'application/javascript'}
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Server is running'}), 200

@app.route('/api/validate-key', methods=['GET'])
def validate_key():
    """Validate OpenRouter API key"""
    try:
        key_to_validate = ''
        for cfg in MODEL_CONFIGS:
            key_to_validate = (cfg.get('api_key') or '').strip()
            if key_to_validate:
                break
        if not key_to_validate:
            key_to_validate = OPENROUTER_API_KEY

        if not key_to_validate:
            return jsonify({
                'valid': False,
                'message': 'API key not set. Set OPENROUTER_API_KEY or MODEL_X_API_KEY in .env file'
            }), 400
        
        # Try a simple test call
        headers = {
            'Authorization': f'Bearer {key_to_validate}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:8000',
            'X-Title': 'AI Search Engine'
        }
        
        test_payload = {
            'model': FREE_MODELS[0],
            'messages': [{'role': 'user', 'content': 'test'}],
            'max_tokens': 10
        }
        
        response = requests.post(OPENROUTER_BASE_URL, json=test_payload, headers=headers, timeout=3)
        
        if response.status_code == 200:
            return jsonify({'valid': True, 'message': 'API key is valid'}), 200
        else:
            return jsonify({
                'valid': False,
                'message': f'API Error {response.status_code}',
                'details': response.text[:200]
            }), 400
    except Exception as e:
        return jsonify({
            'valid': False,
            'message': f'Error validating key: {str(e)}'
        }), 500

@app.route('/api/upload', methods=['POST'])
def upload_document():
    """Upload and index document"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': f'File type not allowed. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'}), 400
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        # Save file
        file.save(filepath)
        file_size = os.path.getsize(filepath)
        
        # Extract text
        content = extract_text_from_file(filepath, filename)
        
        # Generate embedding
        embedding = generate_embedding(content)
        
        # Store in database
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        file_ext = filename.rsplit('.', 1)[1].lower()
        c.execute('''INSERT INTO documents (filename, content, embedding, file_size, document_type)
                     VALUES (?, ?, ?, ?, ?)''',
                  (filename, content, embedding, file_size, file_ext))
        
        conn.commit()
        doc_id = c.lastrowid
        conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Document "{filename}" uploaded successfully',
            'doc_id': doc_id,
            'file_size': file_size
        }), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents', methods=['GET'])
def get_documents():
    """Get list of uploaded documents"""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT id, filename, file_size, document_type, upload_date FROM documents ORDER BY upload_date DESC')
        documents = c.fetchall()
        conn.close()
        
        docs_list = []
        for doc in documents:
            docs_list.append({
                'id': doc[0],
                'filename': doc[1],
                'file_size': doc[2],
                'type': doc[3],
                'upload_date': doc[4]
            })
        
        return jsonify({'documents': docs_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """Delete a document"""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT filename FROM documents WHERE id = ?', (doc_id,))
        result = c.fetchone()
        
        if not result:
            return jsonify({'error': 'Document not found'}), 404
        
        filename = result[0]
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        # Delete from database
        c.execute('DELETE FROM documents WHERE id = ?', (doc_id,))
        conn.commit()
        conn.close()
        
        # Delete file
        if os.path.exists(filepath):
            os.remove(filepath)
        
        return jsonify({'status': 'success', 'message': 'Document deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete-document', methods=['POST'])
def delete_document_by_filename():
    """Delete a document by filename (for frontend compatibility)"""
    try:
        data = request.json or {}
        filename = data.get('filename', '').strip()
        if not filename:
            return jsonify({'error': 'filename required'}), 400
        filename = secure_filename(filename)
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT id FROM documents WHERE filename = ?', (filename,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Document not found'}), 404
        doc_id = row[0]
        c.execute('DELETE FROM documents WHERE id = ?', (doc_id,))
        conn.commit()
        conn.close()
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'status': 'success', 'message': 'Document deleted'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats', methods=['GET'])
def list_chats():
    """List all chat sessions (past chats)."""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC LIMIT 100')
        rows = c.fetchall()
        conn.close()
        chats = [{'id': r[0], 'title': r[1], 'created_at': r[2], 'updated_at': r[3]} for r in rows]
        return jsonify({'chats': chats}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats/<int:chat_id>', methods=['GET'])
def get_chat(chat_id):
    """Get one chat with all messages."""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT id, title, created_at, updated_at FROM chats WHERE id = ?', (chat_id,))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({'error': 'Chat not found'}), 404
        c.execute('SELECT role, content, model_name, created_at FROM chat_messages WHERE chat_id = ? ORDER BY created_at ASC', (chat_id,))
        msg_rows = c.fetchall()
        conn.close()
        messages = [{'role': r[0], 'content': r[1], 'model': r[2] or '', 'created_at': r[3]} for r in msg_rows]
        return jsonify({'id': row[0], 'title': row[1], 'created_at': row[2], 'updated_at': row[3], 'messages': messages}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats', methods=['POST'])
def create_chat():
    """Create a new chat. Body: { title?: string }."""
    try:
        data = request.json or {}
        title = (data.get('title') or 'New chat').strip()[:200]
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('INSERT INTO chats (title) VALUES (?)', (title,))
        chat_id = c.lastrowid
        conn.commit()
        c.execute('SELECT id, title, created_at, updated_at FROM chats WHERE id = ?', (chat_id,))
        row = c.fetchone()
        conn.close()
        return jsonify({'id': row[0], 'title': row[1], 'created_at': row[2], 'updated_at': row[3]}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chats/<int:chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    """Delete a chat and its messages."""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('DELETE FROM chat_messages WHERE chat_id = ?', (chat_id,))
        c.execute('DELETE FROM chats WHERE id = ?', (chat_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _append_chat_messages(chat_id, user_content, assistant_content, model_name=None):
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.execute('INSERT INTO chat_messages (chat_id, role, content, model_name) VALUES (?, ?, ?, ?)', (chat_id, 'user', user_content, None))
    c.execute('INSERT INTO chat_messages (chat_id, role, content, model_name) VALUES (?, ?, ?, ?)', (chat_id, 'assistant', assistant_content, model_name))
    c.execute('UPDATE chats SET updated_at = CURRENT_TIMESTAMP, title = CASE WHEN title = ? THEN ? ELSE title END WHERE id = ?', ('New chat', (user_content[:50] + '...') if len(user_content) > 50 else user_content, chat_id))
    conn.commit()
    conn.close()

def _get_cache_key(query, use_memory, history):
    h = hashlib.sha256(f"{query}|{use_memory}|{json.dumps(history or [])}".encode()).hexdigest()
    return h[:32]

def _get_cached_response(query_key):
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT response_json, created_at FROM query_cache WHERE query_hash = ?', (query_key,))
        row = c.fetchone()
        conn.close()
        if row:
            resp_json, created = row[0], row[1]
            try:
                created_ts = datetime.datetime.strptime(created, '%Y-%m-%d %H:%M:%S').timestamp()
            except (ValueError, TypeError):
                created_ts = time.time() - CACHE_TTL_SECONDS  # treat as expired
            if time.time() - created_ts < CACHE_TTL_SECONDS:
                return json.loads(resp_json)
    except Exception as e:
        print(f"[Cache] Error: {e}")
    return None

def _set_cached_response(query_key, payload):
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('INSERT OR REPLACE INTO query_cache (query_hash, response_json, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)', (query_key, json.dumps(payload)))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Cache] Set error: {e}")

@app.route('/api/search', methods=['POST'])
def search():
    """Search with optional chat memory and past chat support."""
    try:
        data = request.json or {}
        query = data.get('query', '')
        top_k = data.get('top_k', 5)
        chat_id = data.get('chat_id')
        use_memory = data.get('use_memory', False)
        history = data.get('history') or []
        use_cache = data.get('use_cache', True)
        mode = (data.get('mode') or 'compare').strip().lower()
        
        if not query:
            return jsonify({'error': 'Query is required'}), 400
        
        # Check cache
        if use_cache:
            cache_key = _get_cache_key(query, use_memory, history)
            cached = _get_cached_response(cache_key)
            if cached:
                return jsonify(cached), 200
        
        start_time = time.time()
        
        doc_results = similarity_search(query, top_k)
        # Fetch all doc names only for the API response (so the frontend can show the strip)
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('SELECT filename FROM documents ORDER BY upload_date DESC')
        all_doc_names = [row[0] for row in c.fetchall()]
        conn.close()
        
        # Only pass context from documents that are actually relevant to this query
        context = ""
        if doc_results:
            context = "The following document excerpts are relevant to the query (ranked by relevance):\n"
            for result in doc_results:
                pct = int(result['similarity'] * 100)
                context += f"\n[{result['filename']} – {pct}% match]\n{result['content'][:500]}\n"
            context += "\nAnswer based on the most relevant document(s) above."
        
        # Pass conversation history to model when chat memory is on
        api_history = history if use_memory else []
        if mode == 'fast':
            selected_model_configs = MODEL_CONFIGS[:1]
        elif mode == 'smart':
            selected_model_configs = MODEL_CONFIGS[:2]
        else:
            selected_model_configs = MODEL_CONFIGS

        ai_responses = query_multiple_models_simultaneously(
            query,
            context,
            history=api_history,
            model_configs=selected_model_configs
        )
        
        # Always show all model cards (success + error). Only retry if we got zero responses at all.
        if not ai_responses:
            fallback_model = FREE_MODELS[0] if FREE_MODELS else _DEFAULT_MODELS[0]
            print(f"[API] No responses at all — retrying with {fallback_model} as last resort...")
            fallback_result = query_openrouter_model(fallback_model, query, context, api_history, _resolve_model_key(fallback_model))
            ai_responses = [fallback_result]

        # If every single response is an error, try openrouter/free once more to get at least one answer
        if all(r.get('status') == 'error' for r in ai_responses):
            fallback_model = FREE_MODELS[0] if FREE_MODELS else _DEFAULT_MODELS[0]
            print(f"[API] All models returned errors — trying {fallback_model} as last resort...")
            fallback_result = query_openrouter_model(fallback_model, query, context, api_history, _resolve_model_key(fallback_model))
            if fallback_result.get('status') == 'success':
                # Prepend the working response so it appears first
                ai_responses = [fallback_result] + ai_responses
        
        elapsed_time = time.time() - start_time
        save_search_history(query, 'multi-model', len(doc_results), elapsed_time)
        
        # Use first successful response for chat message storage
        assistant_content = ''
        model_name = None
        for r in ai_responses:
            if r.get('status') == 'success':
                assistant_content = r.get('response', '')
                model_name = r.get('model', '')
                break
        if not assistant_content:
            assistant_content = ai_responses[0].get('response', 'No response') if ai_responses else 'No response'
        
        # Create or update chat and append messages
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        if chat_id:
            c.execute('SELECT id FROM chats WHERE id = ?', (chat_id,))
            if not c.fetchone():
                chat_id = None
        if not chat_id:
            c.execute('INSERT INTO chats (title) VALUES (?)', ((query[:50] + '...') if len(query) > 50 else query,))
            chat_id = c.lastrowid
            conn.commit()
        conn.close()
        
        _append_chat_messages(chat_id, query, assistant_content, model_name)
        
        # Best answer index (first successful response by score)
        best_idx = 0
        for i, r in enumerate(ai_responses):
            if r.get('status') == 'success' and r.get('score', 0) > 0:
                best_idx = i
                break
        
        payload = {
            'query': query,
            'chat_id': chat_id,
            'document_results': doc_results,
            'total_documents': len(doc_results),
            'attached_document_names': all_doc_names,
            'ai_responses': ai_responses,
            'response_time': elapsed_time,
            'best_answer_index': best_idx,
        }
        
        if use_cache:
            try:
                _set_cached_response(cache_key, payload)
            except Exception:
                pass
        
        return jsonify(payload), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/suggest', methods=['GET'])
def suggest():
    """Get autocomplete suggestions"""
    try:
        query = request.args.get('q', '').strip()
        
        if not query or len(query) < 2:
            return jsonify({'suggestions': []}), 200
        
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        # Get from search history
        c.execute('''SELECT DISTINCT query FROM search_history 
                     WHERE query LIKE ? 
                     ORDER BY timestamp DESC LIMIT 10''',
                  (f'%{query}%',))
        suggestions = [row[0] for row in c.fetchall()]
        
        conn.close()
        
        # Add popular searches
        popular = [
            'artificial intelligence',
            'machine learning',
            'deep learning',
            'neural networks',
            'natural language processing',
            'computer vision',
            'data science',
            'web development'
        ]
        
        popular_matches = [s for s in popular if query.lower() in s.lower()]
        suggestions.extend(popular_matches)
        suggestions = list(dict.fromkeys(suggestions))[:10]  # Remove duplicates and limit
        
        return jsonify({'suggestions': suggestions}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    """Get search analytics including avg response time, model helpfulness"""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        # Total searches
        c.execute('SELECT COUNT(*) FROM search_history')
        total_searches = c.fetchone()[0]
        
        # Average response time
        c.execute('SELECT AVG(response_time) FROM search_history WHERE response_time > 0')
        avg_response_time = c.fetchone()[0] or 0
        
        # Average results per search
        c.execute('SELECT AVG(results_count) FROM search_history')
        avg_results = c.fetchone()[0] or 0
        
        # Top searches
        c.execute('''SELECT query, COUNT(*) as count FROM search_history 
                     GROUP BY query ORDER BY count DESC LIMIT 10''')
        top_searches = [{'query': row[0], 'count': row[1]} for row in c.fetchall()]
        
        # Searches by model
        c.execute('''SELECT model_used, COUNT(*) as count FROM search_history 
                     GROUP BY model_used''')
        model_stats = [{'model': row[0], 'count': row[1]} for row in c.fetchall()]
        
        # Model helpfulness from feedback
        c.execute('''SELECT model_name, 
                     SUM(CASE WHEN helpful=1 THEN 1 ELSE 0 END) as up,
                     SUM(CASE WHEN helpful=0 THEN 1 ELSE 0 END) as down
                     FROM response_feedback GROUP BY model_name''')
        model_helpfulness = []
        for row in c.fetchall():
            up, down = row[1] or 0, row[2] or 0
            total = up + down
            model_helpfulness.append({
                'model': row[0], 'helpful': up, 'unhelpful': down,
                'rate': round(100 * up / max(1, total), 1) if total else 0
            })
        
        # Total documents
        c.execute('SELECT COUNT(*) FROM documents')
        total_documents = c.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'total_searches': total_searches,
            'total_documents': total_documents,
            'avg_results_per_search': float(avg_results),
            'avg_response_time_seconds': round(avg_response_time, 2),
            'top_searches': top_searches,
            'model_stats': model_stats,
            'model_helpfulness': model_helpfulness,
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/feedback', methods=['POST'])
def submit_feedback():
    """Submit thumbs up/down for a model response"""
    try:
        data = request.json or {}
        model_name = data.get('model_name', '').strip()
        helpful = 1 if data.get('helpful', True) else 0
        if not model_name:
            return jsonify({'error': 'model_name required'}), 400
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('INSERT INTO response_feedback (model_name, helpful) VALUES (?, ?)', (model_name, helpful))
        conn.commit()
        conn.close()
        return jsonify({'status': 'success'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/record', methods=['POST'])
def record_analytics():
    """Record search analytics"""
    try:
        data = request.json
        query = data.get('query', '')
        category = data.get('category', 'general')
        results_found = data.get('results_found', False)
        user_satisfaction = data.get('user_satisfaction', 0)
        
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''INSERT INTO search_analytics (query, category, results_found, user_satisfaction)
                     VALUES (?, ?, ?, ?)''',
                  (query, category, results_found, user_satisfaction))
        conn.commit()
        conn.close()
        
        return jsonify({'status': 'success'}), 201
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search-history', methods=['GET'])
def get_search_history():
    """Get recent search history"""
    try:
        limit = request.args.get('limit', 20, type=int)
        
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''SELECT query, model_used, results_count, timestamp 
                     FROM search_history 
                     ORDER BY timestamp DESC LIMIT ?''', (limit,))
        history = c.fetchall()
        conn.close()
        
        history_list = []
        for item in history:
            history_list.append({
                'query': item[0],
                'model': item[1],
                'results_count': item[2],
                'timestamp': item[3]
            })
        
        return jsonify({'history': history_list}), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def save_search_history(query, model, results_count, response_time=0.0):
    """Save search to history"""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        c.execute('''INSERT INTO search_history (query, model_used, results_count, response_time)
                     VALUES (?, ?, ?, ?)''',
                  (query, model, results_count, response_time))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error saving search history: {e}")

@app.route('/api/filter-search', methods=['POST'])
def filter_search():
    """Search with filters and sorting"""
    try:
        data = request.json
        query = data.get('query', '')
        document_type = data.get('document_type', None)
        sort_by = data.get('sort_by', 'relevance')  # relevance, date, size
        limit = data.get('limit', 10)
        
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        if document_type:
            c.execute('SELECT id, filename, content, file_size, upload_date FROM documents WHERE document_type = ?',
                      (document_type,))
        else:
            c.execute('SELECT id, filename, content, file_size, upload_date FROM documents')
        
        documents = c.fetchall()
        conn.close()
        
        # Filter by content
        results = []
        for doc in documents:
            if query.lower() in doc[2].lower():
                results.append({
                    'id': doc[0],
                    'filename': doc[1],
                    'content': doc[2][:500],
                    'file_size': doc[3],
                    'upload_date': doc[4],
                    'score': 1.0 if query.lower() == doc[2][:len(query)].lower() else 0.5
                })
        
        # Sort
        if sort_by == 'date':
            results.sort(key=lambda x: x['upload_date'], reverse=True)
        elif sort_by == 'size':
            results.sort(key=lambda x: x['file_size'], reverse=True)
        else:  # relevance
            results.sort(key=lambda x: x['score'], reverse=True)
        
        return jsonify({
            'results': results[:limit],
            'total': len(results),
            'query': query
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get overall statistics"""
    try:
        conn = sqlite3.connect(DATABASE)
        c = conn.cursor()
        
        # Document count
        c.execute('SELECT COUNT(*) FROM documents')
        doc_count = c.fetchone()[0]
        
        # Total searches
        c.execute('SELECT COUNT(*) FROM search_history')
        search_count = c.fetchone()[0]
        
        # Total indexed size
        c.execute('SELECT SUM(file_size) FROM documents')
        total_size = c.fetchone()[0] or 0
        
        conn.close()
        
        return jsonify({
            'total_documents': doc_count,
            'total_searches': search_count,
            'total_indexed_size_mb': round(total_size / (1024 * 1024), 2)
        }), 200
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/models', methods=['GET'])
def get_models():
    """Get active model configuration metadata for frontend display."""
    try:
        models = []
        for item in MODEL_CONFIGS:
            model_id = item.get('id', '')
            models.append({
                'id': model_id,
                'label': model_id.replace(':free', ''),
                'tooltip': _get_model_tooltip(model_id),
                'has_key': bool((item.get('api_key') or '').strip()),
            })
        return jsonify({'models': models}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=5000, host='127.0.0.1')
