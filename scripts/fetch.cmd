@echo off
rem Run by Windows Task Scheduler (see README): poll the feeds, rebuild posts, publish what is due.
cd /d "%~dp0.."
echo ==== %DATE% %TIME% >> data\autopilot.log
call npm run autopilot >> data\autopilot.log 2>&1
