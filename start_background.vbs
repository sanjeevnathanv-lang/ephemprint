Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\ephemprint"
WshShell.Run "node server.js", 0, False
