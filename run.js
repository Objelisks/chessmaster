'use strict'
let chessmaster = require('./chessmaster3000.js');

// actual program execution time
if(process.argv.length < 3) {
  console.log('SYNTAX: node chessmaster3000.js input-file-name.fen');
  return;
}

// handling cmd line input
let gameState = chessmaster.importFile(process.argv[2]);

// print individual moves
let moveOptions = chessmaster.getOptionsForPlayer(gameState, gameState.playerTurn);
moveOptions.forEach(opt => console.log(chessmaster.formatMove(opt)));

// print summary
let uniquePieceCount = Object.keys(moveOptions.reduce((pre, move) => {
    pre[move.piece+move.fromRank+move.fromFile] = true;
    return pre;
  }, {})).length;
let playerName = gameState.playerTurn === 'w' ? 'white' : 'black';
console.log(`${moveOptions.length} legal moves (${uniquePieceCount} unique pieces) for ${playerName} player`);
