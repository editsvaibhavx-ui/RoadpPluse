import os
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(r"c:\xampp\htdocs\CAPACITY CONNECT\urban-intelligence-platform").resolve()
OUTPUT_ZIP = PROJECT_ROOT / "project-deploy.zip"

# Exact exclude patterns
EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    "venv",
    ".venv",
    "env",
    "ENV",
    "dist",
    ".vite",
    "__pycache__",
    ".pytest_cache",
    ".idea",
    ".vscode",
}

EXCLUDE_EXTS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".db",
    ".sqlite",
    ".sqlite3",
}

EXCLUDE_FILES = {
    ".env",
    ".env.local",
    "project-deploy.zip",
    "ready_to_deploy.zip",
    "deploy.zip",
    ".DS_Store",
    "Thumbs.db",
}

def should_exclude(rel_path_str: str) -> bool:
    parts = rel_path_str.replace("\\", "/").split("/")
    
    # Exclude directories
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
            
    filename = parts[-1]
    
    # Exclude specific files
    if filename in EXCLUDE_FILES:
        return True
        
    # Exclude specific extensions
    ext = os.path.splitext(filename)[1].lower()
    if ext in EXCLUDE_EXTS:
        return True

    # Exclude uploaded media / cached frame crops (keep .gitkeep only)
    if "uploads/" in rel_path_str.replace("\\", "/") and filename != ".gitkeep":
        return True
    if "processed/" in rel_path_str.replace("\\", "/") and filename != ".gitkeep":
        return True

    return False

def create_zip():
    print(f"Creating deployable package at: {OUTPUT_ZIP}")
    count = 0
    total_bytes = 0
    
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            # Prune excluded directories from traversal
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(PROJECT_ROOT)
                rel_path_str = str(rel_path)
                
                if should_exclude(rel_path_str):
                    continue
                    
                zf.write(full_path, rel_path_str)
                count += 1
                total_bytes += full_path.stat().st_size
                
    print(f"ZIP Creation Completed!")
    print(f"Files included: {count}")
    print(f"Uncompressed size: {total_bytes / (1024*1024):.2f} MB")
    print(f"ZIP Archive size: {OUTPUT_ZIP.stat().st_size / (1024*1024):.2f} MB")

if __name__ == "__main__":
    create_zip()
