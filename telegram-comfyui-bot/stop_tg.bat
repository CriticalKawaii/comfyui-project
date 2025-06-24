@echo off
cd /d ".\"
echo Stopping comfyui-bot...
call resurrect_processes.bat
pm2 stop comfyui-bot
echo Done!
exit