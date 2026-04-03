#!/usr/bin/env python3
"""
AI Search Engine Launcher
Starts both backend (Flask) and frontend (HTTP Server) simultaneously
"""

import os
import sys
import subprocess
import time
import platform
import webbrowser
from pathlib import Path

# Load environment variables from .env file
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

def check_environment():
    """Check if API key is set"""
    api_key = (os.getenv('OPENROUTER_API_KEY') or '').strip()
    model_keys = [
        os.getenv('MODEL_1_API_KEY', '').strip(),
        os.getenv('MODEL_2_API_KEY', '').strip(),
        os.getenv('MODEL_3_API_KEY', '').strip(),
    ]
    has_global_key = bool(api_key) and api_key != 'your-api-key-here'
    has_any_key = has_global_key or any(model_keys)

    if not has_any_key:
        print("\n⚠️  WARNING: OpenRouter API key not set!")
        print("━" * 60)
        print("To use this application, you need to:")
        print("1. Get a free API key from: https://openrouter.io/keys")
        print("2. Set OPENROUTER_API_KEY or MODEL_1_API_KEY / MODEL_2_API_KEY / MODEL_3_API_KEY:")
        print()
        if platform.system() == 'Windows':
            print("   set OPENROUTER_API_KEY=sk_your_key_here")
        else:
            print("   export OPENROUTER_API_KEY=sk_your_key_here")
        print()
        print("3. Then run: python run.py")
        print("━" * 60)
        response = input("\nContinue anyway? (y/n): ").strip().lower()
        if response != 'y':
            sys.exit(1)

def install_dependencies():
    """Check and install dependencies"""
    print("\n📦 Checking dependencies...")
    try:
        import flask
        import flask_cors
        import sklearn
        import requests
        print("✅ All dependencies installed")
    except ImportError as e:
        print(f"⚠️  Missing dependency: {e}")
        print("⚠️  Installing missing dependencies...")
        try:
            # Try with --no-cache-dir to avoid SSL issues
            subprocess.check_call([
                sys.executable, '-m', 'pip', 'install', 
                '-r', 'requirements.txt',
                '--no-cache-dir',
                '--disable-pip-version-check'
            ])
            print("✅ Dependencies installed")
        except subprocess.CalledProcessError:
            # If installation fails, continue anyway - might already be installed
            print("⚠️  Installation had issues, attempting to continue...")
            print("   Some features may not work if dependencies are missing")
            print("   Try: pip install -r requirements.txt --upgrade")

def start_backend():
    """Start Flask backend"""
    print("\n🚀 Starting Backend Server...")
    print("   Flask running on: http://localhost:5000")
    
    if platform.system() == 'Windows':
        # Windows: Use subprocess without shell for cleaner output
        return subprocess.Popen(
            [sys.executable, 'app.py'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_CONSOLE if platform.system() == 'Windows' else 0
        )
    else:
        # Linux/Mac: Start in background
        return subprocess.Popen(
            [sys.executable, 'app.py'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )

def start_frontend():
    """Start HTTP Server for frontend"""
    print("🌐 Starting Frontend Server...")
    print("   Frontend running on: http://localhost:8000")
    
    if platform.system() == 'Windows':
        return subprocess.Popen(
            [sys.executable, '-m', 'http.server', '8000'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        return subprocess.Popen(
            [sys.executable, '-m', 'http.server', '8000'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid
        )

def open_browser():
    """Open application in default browser"""
    print("\n🌟 Opening browser...")
    time.sleep(2)  # Wait for servers to start
    try:
        webbrowser.open('http://localhost:8000')
        print("✅ Browser opened at http://localhost:8000")
    except Exception as e:
        print(f"⚠️  Could not open browser: {e}")
        print("   Please manually visit: http://localhost:8000")

def main():
    """Main launcher function"""
    print("\n" + "=" * 60)
    print("  AI SEARCH ENGINE - OpenRouter Edition")
    print("=" * 60)
    
    # Check API key
    check_environment()
    
    # Check dependencies
    install_dependencies()
    
    print("\n" + "=" * 60)
    print("  STARTING SERVERS")
    print("=" * 60)
    
    # Start servers
    backend_process = start_backend()
    frontend_process = start_frontend()
    
    # Open browser
    open_browser()
    
    print("\n" + "=" * 60)
    print("✅ SERVERS RUNNING")
    print("=" * 60)
    print("\n📍 Application ready at: http://localhost:8000")
    print("\n💡 Tips:")
    print("   • Upload documents for better context")
    print("   • Try asking different questions")
    print("   • Check Analytics for usage insights")
    print("\n🛑 To stop: Press Ctrl+C")
    print("=" * 60 + "\n")
    
    try:
        # Keep running until interrupted
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n⛔ Shutting down servers...")
        
        # Terminate processes
        backend_process.terminate()
        frontend_process.terminate()
        
        # Wait for graceful shutdown
        try:
            backend_process.wait(timeout=5)
            frontend_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend_process.kill()
            frontend_process.kill()
        
        print("✅ Servers stopped")
        print("Goodbye! 👋\n")
        sys.exit(0)

if __name__ == '__main__':
    main()
