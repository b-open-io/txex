# VHS Demo - Image Transforms
# Run with: vhs demo-transforms.tape

Output demo-transforms.gif

Set FontSize 14
Set Width 900
Set Height 400
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set Padding 20
Set Shell zsh
Env PATH "/Users/satchmo/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

# Extract original image
Type "txex 8c4400b113c956748953ce20da2a0290a0dde3f9a6d7d1f68e290b2799805440_0 -o original.jpg"
Enter
Sleep 5s

# Resize to thumbnail
Type "txex 8c4400b113c956748953ce20da2a0290a0dde3f9a6d7d1f68e290b2799805440_0 -w 200 -f webp -o thumb.webp"
Enter
Sleep 3s

# Grayscale blur placeholder
Type "txex 8c4400b113c956748953ce20da2a0290a0dde3f9a6d7d1f68e290b2799805440_0 -w 100 --blur 10 --grayscale -f webp -o placeholder.webp"
Enter
Sleep 3s

# Show results
Type "ls -lh original.jpg thumb.webp placeholder.webp"
Enter
Sleep 2s

# Clean up
Type "rm -f original.jpg thumb.webp placeholder.webp"
Enter
Sleep 500ms
