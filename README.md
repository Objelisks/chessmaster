chessmaster3000
===============
given a board state in [FEN](https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation) format, outputs all possible moves for the active player (determined by file format's active player field)

* handles castling and en passant, but not check/checkmate restrictions
* uses modern es6 features as much as possible in appropriate situations


running
=======
Tested using Node.js 4.4.0

run: `node chessmaster3000.js input1.fen`


inputs
======

* input1: normal starting game state (white's turn)
* input2: after 1. e4 (black's turn)
* input3: after 1. c5 (white's turn)
* input4: after 2. Nf3 (black's turn)
* input5: en passant example
* input6: castling example (white's turn)
