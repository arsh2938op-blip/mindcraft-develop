@echo off
title Mindcraft Launcher

echo.
echo ==============================
echo        MINDCRAFT LAUNCHER
echo ==============================
echo.

REM ==============================
REM MindCraft Runtime Configuration
REM Edit any default below directly - no JavaScript editing required.
REM At each prompt further down, press Enter to keep the default,
REM or type a new value to override it for this run.
REM ==============================

set SERVER_IP=127.0.0.1
set SERVER_PORT=55916
set MC_VERSION=auto
set AUTH=offline

set MINDSERVER_PORT=8080
set AUTO_OPEN_UI=true

set BASE_PROFILE=assistant
set PROFILES=./andy.json

set LOAD_MEMORY=false
set INIT_MESSAGE=Respond with hello world and your name

set ONLY_CHAT_WITH=

set SPEAK=false
set CHAT_INGAME=true
set LANGUAGE=en

set VIEWER=false

set ALLOW_INSECURE_CODING=false
set ALLOW_VISION=false

set BLOCKED_ACTIONS=!checkBlueprint;!checkBlueprintLevel;!getBlueprint;!getBlueprintLevel

set CODE_TIMEOUT_MINS=-1
set RELEVANT_DOCS_COUNT=5
set MAX_MESSAGES=15
set NUM_EXAMPLES=2
set MAX_COMMANDS=-1
set SHOW_COMMAND_SYNTAX=full

set NARRATE_BEHAVIOR=true
set CHAT_BOT_MESSAGES=true

set SPAWN_TIMEOUT=30
set BLOCK_PLACE_DELAY=0
set LOG_ALL_PROMPTS=false

REM ==============================
REM Interactive overrides (press Enter to keep the defaults above)
REM ==============================

set /p SERVER_IP=Server IP [%SERVER_IP%]:
set /p SERVER_PORT=Server Port [%SERVER_PORT%]:

set "MODELS="
set "MODEL_PRESET="

echo.
set /p BOT_COUNT=Number of Bots:

echo.
set /p SPAWN_DELAY=Spawn Delay (seconds):

echo.
set /p BOT_NAMES=Bot Names (optional):

echo.
set /p VIEWER=Viewer (true/false) [%VIEWER%]:

echo.
echo ========== OPTIONAL FEATURES ==========

set /p API_ROTATION=Enable API Key Rotation? (Y/N):

set /p SPEAKJS=Enable Speak.js STT/TTS? (Y/N):

set /p OWNERSHIP=Enable Ownership System? (Y/N):


(
echo SERVER_IP=%SERVER_IP%
echo SERVER_PORT=%SERVER_PORT%
echo.
echo MODELS=%MODELS%
echo.
echo BOT_COUNT=%BOT_COUNT%
echo.
echo BOT_NAMES=%BOT_NAMES%
echo.
echo SPAWN_DELAY=%SPAWN_DELAY%
echo.
echo VIEWER=%VIEWER%
echo.
echo API_ROTATION=%API_ROTATION%
echo.
echo SPEAKJS=%SPEAKJS%
echo.
echo OWNERSHIP=%OWNERSHIP%
) > .env

echo.
echo ==============================
echo Configuration saved!
echo ==============================
echo.
echo Server : %SERVER_IP%:%SERVER_PORT%
echo Models : %MODELS%
echo Bots   : %BOT_COUNT%
echo.
echo Starting MindCraft...
echo.
echo.
echo ==============================
echo        MODEL PRESETS
echo ==============================
echo.
echo [1] Default
echo [2] Duo
echo [3] Online
echo [4] All
echo [5] Potato
echo [6] Speed
echo [7] Custom
echo [Enter] Default
echo.

set "PRESET_CHOICE="
set /p "PRESET_CHOICE=Choose preset: "

if "%PRESET_CHOICE%"=="" set "MODEL_PRESET=default"
if "%PRESET_CHOICE%"=="1" set "MODEL_PRESET=default"
if "%PRESET_CHOICE%"=="2" set "MODEL_PRESET=duo"
if "%PRESET_CHOICE%"=="3" set "MODEL_PRESET=online"
if "%PRESET_CHOICE%"=="4" set "MODEL_PRESET=all"
if "%PRESET_CHOICE%"=="5" set "MODEL_PRESET=potato"
if "%PRESET_CHOICE%"=="6" set "MODEL_PRESET=speed"

if "%PRESET_CHOICE%"=="7" (
    set "MODEL_PRESET="
    set /p "MODELS=Custom models: "
)

echo.
echo Model Preset: %MODEL_PRESET%
echo Custom Models: %MODELS%
echo.

node launcher.js

pause