# AI Search Engine - OpenRouter Edition

A modern AI-powered search platform that queries multiple free language models at once and combines their answers with your uploaded document context. It is designed for quick research, smarter search, and side-by-side model comparison in one clean interface.

> This project can be extended into an enterprise AI evaluation dashboard for comparing model quality, speed, and relevance.

## Overview

This application combines:
- A Flask backend for search, document indexing, and analytics
- A lightweight frontend for interactive querying
- OpenRouter-powered free AI model access
- Local SQLite storage for history and document metadata
- TF-IDF-based document retrieval to improve response quality

## Key Features

### Multi-model AI search
- Send one query to multiple models simultaneously
- Compare responses side-by-side in real time
- Use free OpenRouter models without needing a paid plan
- Easily swap model providers in configuration

### Document-aware search
- Upload TXT, PDF, JSON, MD, and DOCX files
- Index documents locally for semantic matching
- Prioritize relevant uploaded content in search results
- Let AI models answer using your project or knowledge base context

### Analytics and monitoring
- Track total searches, document count, and model usage
- Monitor recent search history
- Observe response times and performance patterns
- Build insights around which models perform best for your tasks

### Flexible configuration
- Set one global API key or per-model keys
- Change models using environment variables or `.env`
- Adjust response temperature, model selection, and behavior
- Tune the upload size and server port as needed

## Supported Free Models

The project is configured to work with free OpenRouter models such as:
- NVIDIA Nemotron 3 Nano 30B
- OpenAI GPT-OSS 20B
- Qwen3 Next 80B A3B Instruct

## Tech Stack

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript
- Responsive single-page interface

### Backend
- Python
- Flask
- SQLite
- `requests`
- `scikit-learn` for TF-IDF

### AI Integration
- OpenRouter API
- Concurrent API request handling
- Local semantic indexing

## Project Structure

```text
AI-Search-Engine-Multi-Model-LLM-Platform-main/
├── app.py                 # Flask backend and API routes
├── engine.js              # Frontend logic
├── index.html             # User interface
├── styles.css             # Styling
├── run.py                 # Startup launcher
├── requirements.txt       # Python dependencies
├── .env                   # Optional model configuration
├── uploads/               # Uploaded document storage
├── search_engine.db       # SQLite database
└── README.md              # Project documentation
```

## Quick Start

### 1) Create a free OpenRouter account
Visit: https://openrouter.io

Generate an API key and keep it ready.

### 2) Set your environment variable

Windows (PowerShell):
```powershell
$env:OPENROUTER_API_KEY = "your-key-here"
```

Linux/macOS:
```bash
export OPENROUTER_API_KEY="your-key-here"
```

### 3) Install dependencies
```bash
pip install -r requirements.txt
```

### 4) Run the app
```bash
python run.py
```

This will start:
- Backend on port 5000
- Frontend on port 8000
- Browser launch at http://localhost:8000

### Manual run
If you want to run each part separately:

Terminal 1:
```bash
python app.py
```

Terminal 2:
```bash
python -m http.server 8000
```

Then open:
```text
http://localhost:8000
```

## Configuration

### API key setup
```bash
# Windows
set OPENROUTER_API_KEY=your-key

# Linux/macOS
export OPENROUTER_API_KEY=your-key
```

### Per-model keys
You can also configure model-specific keys in `.env`:

```env
MODEL_1=nvidia/nemotron-3-nano-30b-a3b:free
MODEL_2=openai/gpt-oss-20b:free
MODEL_3=qwen/qwen3-next-80b-a3b-instruct:free
```

### Change upload limit
```python
MAX_FILE_SIZE = 50 * 1024 * 1024
```

### Change server port
```python
app.run(debug=True, port=5000)
```

## Usage

1. Type a question into the search box.
2. The system sends the query to multiple models simultaneously.
3. Compare model responses side-by-side.
4. Upload documents to enrich the answer with relevant context.
5. Explore analytics and recent search history.

## API Endpoints

### Search
```http
POST /api/search
```
Request example:
```json
{
  "query": "Explain the benefits of AI search",
  "top_k": 5
}
```

### Upload document
```http
POST /api/upload
```
Upload a file using multipart form data.

### List documents
```http
GET /api/documents
```

### Delete document
```http
DELETE /api/documents/{doc_id}
```

### Autocomplete
```http
GET /api/suggest?q=search_term
```

### Analytics
```http
GET /api/analytics
GET /api/stats
```

## Database

The application uses SQLite with these core tables:
- `documents` — uploaded files and metadata
- `search_history` — queries and responses
- `search_analytics` — usage statistics and metrics

## Security Notes

- API keys are stored in environment variables instead of source code
- Uploaded files are validated for size and type
- Filenames are sanitized before storage
- Data stays local on the machine using SQLite
- OpenRouter keys should never be hardcoded into the project

## Troubleshooting

### Models are not responding
```bash
pip install --upgrade requests flask flask-cors
python app.py
```

### CORS issues
- Confirm the backend is running on port 5000
- Validate the health endpoint at http://localhost:5000/api/health
- Check browser developer tools for errors

### Slow first request
The first query may take a few seconds while models load and connect.

### API key issues
- Generate a new key from OpenRouter
- Confirm your environment variable is set correctly
- Restart the app after updating the key

### Document upload fails
- Make sure the file size is under the configured limit
- Use supported formats such as TXT, PDF, JSON, MD, or DOCX
- Confirm the `uploads/` directory is writable

## Future Improvements

- Add more free model providers
- Improve ranking and query optimization
- Support batch uploads
- Add export functionality for results
- Add custom filters and dashboards
- Improve error handling and logging

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome. Areas of interest include:
- New AI model integrations
- Search quality improvements
- UI/UX enhancements
- Documentation updates
- Testing and bug fixes

## Contribution

Contributed by: Adarsh 

---

Built with ❤️ for smarter, multi-model AI search.

## 🔧 Configuration

### OpenRouter API Key
=======
### 3) Install dependencies
```bash
pip install -r requirements.txt
```

### 4) Run the app
```bash
python run.py
```

This will start:
- Backend on port 5000
- Frontend on port 8000
- Browser launch at http://localhost:8000

### Manual run
If you want to run each part separately:

Terminal 1:
```bash
python app.py
```

Terminal 2:
```bash
python -m http.server 8000
```

Then open:
```text
http://localhost:8000
```

## Configuration

### API key setup
>>>>>>> 1dbd907 (Update README and project files)
```bash
# Windows
set OPENROUTER_API_KEY=your-key

<<<<<<< HEAD
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
=======
# Linux/macOS
export OPENROUTER_API_KEY=your-key
```

### Per-model keys
You can also configure model-specific keys in `.env`:

```env
>>>>>>> 1dbd907 (Update README and project files)
MODEL_1=nvidia/nemotron-3-nano-30b-a3b:free
MODEL_2=openai/gpt-oss-20b:free
MODEL_3=qwen/qwen3-next-80b-a3b-instruct:free
```

<<<<<<< HEAD
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
=======
### Change upload limit
```python
MAX_FILE_SIZE = 50 * 1024 * 1024
```

### Change server port
```python
app.run(debug=True, port=5000)
```

## Usage

1. Type a question into the search box.
2. The system sends the query to multiple models simultaneously.
3. Compare model responses side-by-side.
4. Upload documents to enrich the answer with relevant context.
5. Explore analytics and recent search history.

## API Endpoints

### Search
```http
POST /api/search
```
Request example:
```json
{
  "query": "Explain the benefits of AI search",
  "top_k": 5
}
```

### Upload document
```http
POST /api/upload
```
Upload a file using multipart form data.

### List documents
```http
GET /api/documents
```

### Delete document
```http
>>>>>>> 1dbd907 (Update README and project files)
DELETE /api/documents/{doc_id}
```

### Autocomplete
<<<<<<< HEAD
```bash
=======
```http
>>>>>>> 1dbd907 (Update README and project files)
GET /api/suggest?q=search_term
```

### Analytics
<<<<<<< HEAD
```bash
=======
```http
>>>>>>> 1dbd907 (Update README and project files)
GET /api/analytics
GET /api/stats
```

<<<<<<< HEAD
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
=======
## Database

The application uses SQLite with these core tables:
- `documents` — uploaded files and metadata
- `search_history` — queries and responses
- `search_analytics` — usage statistics and metrics

## Security Notes

- API keys are stored in environment variables instead of source code
- Uploaded files are validated for size and type
- Filenames are sanitized before storage
- Data stays local on the machine using SQLite
- OpenRouter keys should never be hardcoded into the project

## Troubleshooting

### Models are not responding
>>>>>>> 1dbd907 (Update README and project files)
```bash
pip install --upgrade requests flask flask-cors
python app.py
```

<<<<<<< HEAD
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
=======
### CORS issues
- Confirm the backend is running on port 5000
- Validate the health endpoint at http://localhost:5000/api/health
- Check browser developer tools for errors

### Slow first request
The first query may take a few seconds while models load and connect.

### API key issues
- Generate a new key from OpenRouter
- Confirm your environment variable is set correctly
- Restart the app after updating the key

### Document upload fails
- Make sure the file size is under the configured limit
- Use supported formats such as TXT, PDF, JSON, MD, or DOCX
- Confirm the `uploads/` directory is writable

## Future Improvements

- Add more free model providers
- Improve ranking and query optimization
- Support batch uploads
- Add export functionality for results
- Add custom filters and dashboards
- Improve error handling and logging

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome. Areas of interest include:
- New AI model integrations
- Search quality improvements
- UI/UX enhancements
- Documentation updates
- Testing and bug fixes

## Contribution

Contributed by: Adarsh , Yogesh

---

Built with ❤️ for smarter, multi-model AI search.
>>>>>>> 1dbd907 (Update README and project files)



