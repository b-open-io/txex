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

# Extract B:// image and transform to webp thumbnail
Type "txex cbacb16c3a03729165542f20404827f1ee91bc1f9783089c41c59524ebf75a22_0 -w 200 -f webp -o thumb.webp"
Enter
Sleep 5s

# Extract BCAT chunked file (video/mp4 - 9 chunks)
Type "txex fb3c1b442b352f6dcf503dcfa8ad274897184487f41928832858122c1e669da1_0 -o shuaa.mp4"
Enter
Sleep 15s

# Show the files
Type "ls -lh thumb.webp shuaa.mp4"
Enter
Sleep 2s

# Show cache stats
Type "txex cache --stats"
Enter
Sleep 2s

# Clean up
Type "rm -f thumb.webp shuaa.mp4"
Enter
Sleep 500ms
