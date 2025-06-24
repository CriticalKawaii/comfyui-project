@echo off
cd /d ".\"
echo Building react app...
call npm run build
call serve -s build
echo Done!
exit