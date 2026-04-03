# AI Search Engine - OpenRouter Edition

A modern, intelligent search engine powered by **free AI models from OpenRouter**. Query multiple state-of-the-art models simultaneously for better, faster results.

> **This system can be extended into an enterprise-grade AI evaluation platform for comparing large language models.**

## ✨ Key Features

### 🤖 Multiple Free AI Models
- **Simultaneous Querying**: All models process your query at once
- **Free Tier**: No credit card required on OpenRouter
- **Available Models**:
  - NVIDIA Nemotron 3 Nano 30B (free)
  - OpenAI GPT-OSS 20B (free)
  - Qwen3 Next 80B A3B Instruct (free)
- **Compare Results**: See responses from all models side-by-side

### 📄 Document Management
- **Upload Documents**: Drag-and-drop TXT, PDF, JSON, MD, DOCX
- **Semantic Indexing**: Automatic TF-IDF embedding
- **Smart Search**: Query results prioritize uploaded documents
- **Document Context**: AI models see relevant document content

### 🔍 Search Features
- **Multi-Model Search**: Query all models simultaneously
- **Fast Responses**: Concurrent API calls for better performance
- **Document Awareness**: AI models contextualize with your docs
- **Relevance Scoring**: TF-IDF similarity matching
- **Autocomplete**: Smart suggestions from search history

### 📊 Analytics Dashboard
- Total searches and documents
- Model usage statistics
- Recent search history
- Performance metrics
- Response time tracking

### ⚙️ Customization
- **Flexible API Setup**: One global key or one key per model
- **Model Selection**: Configure MODEL_1..MODEL_3 in .env
- **Temperature Control**: Adjust model creativity (0-100%)
- **Response Length**: Short, medium, or long responses
- **Custom Prompts**: Add system instructions

### 🚀 Zero Cost
- Free AI models from OpenRouter
- No monthly subscriptions
- Fully offline document processing
- Local database storage

## 🚀 Quick Start

### All Platforms (Windows, Linux, Mac)

**Step 1: Get Free API Key**
1. Visit https://openrouter.io
2. Create free account (no credit card required)
3. Copy your API key

**Step 2: Set Environment Variable**

**Windows (PowerShell):**
```powershell
$env:OPENROUTER_API_KEY = "your-key-here"
```

**Linux/Mac (Terminal):**
```bash
export OPENROUTER_API_KEY="your-key-here"
```

**Step 3: Run the Application**
```bash
cd path/to/Yogesh
python run.py
```

That's it! The script will:
- ✅ Validate your API key
- ✅ Check and install dependencies
- ✅ Start the backend server (port 5000)
- ✅ Start the frontend server (port 8000)
- ✅ Automatically open http://localhost:8000 in your browser

**Stop the Application:**
Press `Ctrl+C` in the terminal to gracefully shut down both servers.

### Manual Setup (Advanced)
If you prefer manual control:
```bash
# Terminal 1: Backend
python app.py

# Terminal 2: Frontend
python -m http.server 8000
```
Then open http://localhost:8000 in your browser.

## 📋 What's Included

```
Yogesh/
├── run.py                  # 🚀 Universal launcher script
├── index.html              # Main UI (Tailwind CSS)
├── engine.js               # Frontend logic
├── app.py                  # Flask backend
├── requirements.txt        # Python dependencies
├── .venv/                  # Python virtual environment
├── search_engine.db        # SQLite database (auto-created)
└── uploads/                # Document storage
```

## 🎯 Usage Examples

### Search Query
1. Type your question in the search box
2. AI models process simultaneously
3. View responses from all 3 models side-by-side
4. Upload documents for document-aware responses

### Upload & Search
1. Click "📄 Documents" button
2. Drag files or click to browse
3. Wait for indexing
4. Search queries now include document context

### View Analytics
1. Click "📊 Analytics" button
2. See search history and performance metrics
3. Track model usage and response times

## 🛠️ Technology Stack

**Frontend:**
- HTML5, CSS3, Vanilla JavaScript
- Responsive modern UI
- No external dependencies

**Backend:**
- Flask 2.3 (Python web framework)
- SQLite (local database)
- Requests (HTTP client)

**AI/ML:**
- OpenRouter API (free tier)
- TF-IDF embeddings (scikit-learn)
- Concurrent API calls for speed

**Available Models:**
- NVIDIA Nemotron 3 Nano 30B (efficient)
- OpenAI GPT-OSS 20B (structured/coding)
- Qwen3 Next 80B A3B Instruct (long-context)

## 📊 Database

SQLite database with three main tables:
- **documents**: Uploaded documents with TF-IDF embeddings
- **search_history**: All queries and responses
- **search_analytics**: Usage statistics and metrics

## 🔧 Configuration

### OpenRouter API Key
```bash
# Windows
set OPENROUTER_API_KEY=your-key

# Linux/Mac
export OPENROUTER_API_KEY=your-key
```

Get free key at: https://openrouter.io/keys

Per-model keys are also supported in `.env`:
- `MODEL_1` with `MODEL_1_API_KEY`
- `MODEL_2` with `MODEL_2_API_KEY`
- `MODEL_3` with `MODEL_3_API_KEY`

### Change Models
Edit `.env`:
```python
MODEL_1=nvidia/nemotron-3-nano-30b-a3b:free
MODEL_2=openai/gpt-oss-20b:free
MODEL_3=qwen/qwen3-next-80b-a3b-instruct:free
```

### Adjust Upload Limit
Edit `app.py` line ~24:
```python
MAX_FILE_SIZE = 50 * 1024 * 1024  # Change to desired size
```

### Change Port
Edit `app.py` last line:
```python
app.run(debug=True, port=5000)  # Change port here
```

## 🎓 API Reference

### Search Endpoint
```bash
POST /api/search
{
  "query": "your question",
  "top_k": 5
}

Response:
{
  "query": "...",
  "document_results": [...],
  "total_documents": 2,
  "ai_responses": [
    {
      "model": "mistralai/mistral-7b-instruct:free",
      "status": "success",
      "response": "..."
    },
    ...
  ],
  "response_time": 2.45
}
```

### Upload Document
```bash
POST /api/upload
Content-Type: multipart/form-data
file: <binary>
```

### Get Documents
```bash
GET /api/documents
```

### Delete Document
```bash
DELETE /api/documents/{doc_id}
```

### Autocomplete
```bash
GET /api/suggest?q=search_term
```

### Analytics
```bash
GET /api/analytics
GET /api/stats
```

## ⚡ Performance

- **Search Speed**: 2-4 seconds for 3 simultaneous models
- **Document Upload**: Instant indexing
- **Autocomplete**: Real-time (<100ms)
- **Model Size**: Minimal (lightweight free tier models)
- **Concurrent Requests**: Up to 3 models at once

## 🔒 Security Notes

- API key stored in environment variable (not in code)
- File uploads validated for type and size
- Filenames sanitized
- No PII stored in database
- Local SQLite database only
- Free OpenRouter tier (no storage of inputs)

## 🐛 Troubleshooting

**Models not responding:**
```bash
pip install --upgrade requests flask flask-cors
python app.py
```

**CORS errors:**
- Ensure backend runs on port 5000
- Check `http://localhost:5000/api/health`
- See browser console (F12)

**Slow first request:**
- First query loads models (2-3 seconds)
- Subsequent requests are faster

**API Key issues:**
- Visit https://openrouter.io/keys
- Generate new free key if needed
- Verify environment variable is set

**Document upload fails:**
- Check file size (max 50MB)
- Ensure file format supported (TXT, PDF, DOCX, MD, JSON)
- Check uploads/ folder has write permissions

## 📚 Detailed Documentation

See [SETUP.md](SETUP.md) for:
- Complete installation steps
- Environment configuration
- API examples
- Database structure
- Advanced usage

## 🚀 Future Roadmap

- [ ] More free model providers
- [ ] Query optimization
- [ ] Batch uploads
- [ ] Export search results
- [ ] Advanced filtering
- [ ] Custom model support
- [ ] Web deployment guide
- [ ] Performance caching

## 📄 License

MIT License - Free for personal and commercial use

## 🤝 Contributing

Contributions welcome! Areas for help:
- Additional AI model integrations
- Performance optimization
- UI/UX improvements
- Documentation
- Testing and bug reports

## 💡 Tips & Tricks

1. **Multi-Model Advantage**: Compare responses from different AI models
2. **Document Context**: Upload related docs to improve answer quality
3. **API Efficiency**: Simultaneous queries are faster than sequential
4. **Free Tier**: No costs, no rate limits on free OpenRouter tier
5. **Local Storage**: All data stays on your machine

## 🎯 Use Cases

- **Research**: Index papers and get AI insights
- **Q&A**: Compare AI responses side-by-side
- **Documentation**: Build searchable knowledge bases
- **Learning**: Understand how AI models think differently
- **Content Analysis**: Semantic search across documents

## 📞 Support

For issues:
1. Check SETUP.md
2. Verify API key is correct
3. Test health endpoint: `curl http://localhost:5000/api/health`
4. Check browser console (F12)
5. Review error messages in terminal

## ⭐ Features Included

- [x] Multiple Free AI Models
- [x] Simultaneous Multi-Model Queries
- [x] Document Upload & Indexing
- [x] Semantic Search
- [x] Search Analytics
- [x] REST API
- [x] Document Management
- [x] Autocomplete Suggestions

---

**Built with ❤️ | Powered by OpenRouter & Free AI Models**

**v3.0 - OpenRouter Edition | 2024**



