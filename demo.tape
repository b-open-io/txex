# VHS Demo Tape for txex CLI
# Run with: vhs demo.tape

Output demo.gif

Set FontSize 14
Set Width 1000
Set Height 550
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set Padding 20

# Show version
Type "txex --version"
Enter
Sleep 1s

# Extract 3D model from listing (traces origin automatically)
Type "txex 2173157555b91fba7fc830cdc3fe3960ccb1acb64a50a25c8499f4f393708642_0 -o model.glb"
Enter
Sleep 8s

# Extract video from listing (9MB, traces origin)
Type "txex dd4794277fed1b14574ca1aa9423faa18af9abff028713d40fc362ff61b22a39_0 -o video.mp4"
Enter
Sleep 12s

# Show the files
Type "ls -lh model.glb video.mp4"
Enter
Sleep 2s

# Show cache stats
Type "txex cache --stats"
Enter
Sleep 2s

# Clean up
Type "rm -f model.glb video.mp4"
Enter
Sleep 500ms
