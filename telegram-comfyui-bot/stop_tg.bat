@echo off
cd /d ".\"
echo Stopping comfyui-bot...
pm2 stop comfyui-bot
echo Done!
exit