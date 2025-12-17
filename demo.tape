# VHS Demo Tape for txex CLI
# Run with: vhs demo.tape

Output demo.gif

Set FontSize 14
Set Width 900
Set Height 450
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Padding 20

# Extract an image inscription
Type "txex 8c4400b113c956748953ce20da2a0290a0dde3f9a6d7d1f68e290b2799805440_0 -o ape.jpg"
Enter
Sleep 5s

# Extract audio from a marketplace listing (auto-traces to origin)
Type "txex 37ce566cfc6462e109e39f7b3b90db73191deaa098bb785bc3d06b96fc1b3797_0 -o track.mp3"
Enter
Sleep 6s

# Download entire collection (auto-detected!)
Type "txex df8a277aa03b595f6e50b576093ef6fc039a83635b2325640fce6c8d27f9edb5_0 --limit 10"
Enter
Sleep 12s

# Show results
Type "ls -lh ape.jpg track.mp3 && ls 'Cyber Apes'"
Enter
Sleep 2s

# Clean up
Type "rm -rf ape.jpg track.mp3 'Cyber Apes'"
Enter
Sleep 500ms
