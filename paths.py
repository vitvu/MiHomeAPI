"""Đường dẫn dùng chung, hoạt động cả khi chạy source lẫn khi đóng gói PyInstaller."""
import sys
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
# Thư mục chứa tài nguyên đóng gói (static/)
RES_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
# Thư mục ghi dữ liệu người dùng: cạnh file .exe hoặc cạnh source
APP_DIR = Path(sys.executable).parent if FROZEN else Path(__file__).parent
DATA_DIR = APP_DIR / "data"
STATIC_DIR = RES_DIR / "static"
