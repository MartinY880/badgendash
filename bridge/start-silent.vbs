Set objShell = CreateObject("WScript.Shell")
objShell.Run "cmd /c cd /d """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & """ && node bridge.js > bridge.log 2>&1", 0, False
