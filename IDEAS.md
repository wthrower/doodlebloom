# Game Mode Ideas

## Rotate

Tiles are in the correct position but randomly rotated 90/180/270 degrees. Click or tap to rotate 90 degrees clockwise. Solved when all tiles are upright.

Simple to implement -- reuses the grid/image infrastructure, no drag interaction needed. Just track rotation state per tile and render with CSS transform.

## Jigsaw

Actual jigsaw puzzle piece shapes with interlocking tabs and blanks. Pieces start shuffled and randomly rotated (0/90/180/270). Drag to swap positions, click to rotate.

When two adjacent pieces are correctly placed and oriented, they fuse -- the seam disappears and they move as a group (like JigSwap's adjacency groups). Unfused pieces "retract" slightly from their neighbors (small gap or inset) to make the interlocking shapes visible.

Piece shapes: generate tab/blank edges procedurally or from a small set of Bezier templates. Use SVG clip-path or canvas path clipping to cut the image. Each edge is either a tab (convex bump) or a blank (concave notch), with adjacent pieces getting the inverse.

More complex than other modes -- requires shape generation, clip-path rendering, and fuse/retract visual states -- but the swap/rotate interaction and group-fusion logic can build on JigSwap's engine.
