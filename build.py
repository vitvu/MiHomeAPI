"""Build a single-file Windows executable: dist/MiHomeAPI.exe

    pip install -r requirements.txt pyinstaller
    python build.py
"""
import os
import PyInstaller.__main__

sep = os.pathsep
PyInstaller.__main__.run([
    "app.py",
    "--name=MiHomeAPI",
    "--onefile",
    "--console",  # the console window shows the URL; closing it stops the server
    "--icon=assets/icon.ico",
    f"--add-data=static{sep}static",
    "--collect-submodules=uvicorn",
    "--collect-submodules=miio",
    "--hidden-import=miio",
    # keep the binary small: these get pulled in from a dev environment but are not used
    *[f"--exclude-module={m}" for m in (
        "numpy", "pandas", "matplotlib", "scipy", "PIL", "tkinter", "PyQt5", "PyQt6", "PySide6",
        "IPython", "jupyter", "notebook", "pytest", "sphinx", "docutils", "setuptools")],
    "--noconfirm",
    "--clean",
])
