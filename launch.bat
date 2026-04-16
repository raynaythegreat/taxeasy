@echo off
set OPENSSL_DIR=C:\Program Files\OpenSSL-Win64
set OPENSSL_LIB_DIR=C:\Program Files\OpenSSL-Win64\lib\VC\x64\MD
set OPENSSL_INCLUDE_DIR=C:\Program Files\OpenSSL-Win64\include
cd /d "%~dp0"
pnpm tauri dev
