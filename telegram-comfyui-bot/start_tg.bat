@echo off
cd /d ".\"
echo Starting comfyui-bot...
call resurrect_processes.bat
pm2 start comfyui-bot
echo Done!
exit