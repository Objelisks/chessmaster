'use strict'
const fs = require('fs');

// converts string notation "file rank" to array of integer indicies [rank, file] (0-based, flipped vertically)
// example: "e6" -> [5, 2]
let notationToRankFile = function(note) {
  let split = note.split('');
  let rf = [];
  // a -> 0, h->7
  // standard chess algebraic notation has
  // rows as 8 to 1 descending from the top
  // columns as a to h ascending from the left
  rf[0] = 8 - parseInt(split[1]);
  rf[1] = split[0].charCodeAt(0) - 97;
  return rf;
};

// reads FEN file format, assumes file has valid formatting
// https://en.wikipedia.org/wiki/Forsyth%E2%80%93Edwards_Notation
// output: {board, playerTurn, castling, enPassant}
let importFile = function(filename) {
  let state = {};
  let file = fs.readFileSync(filename, 'utf-8');
  let parts = file.split(' ');

  // board state
  // replaces digits with that many empty spaces: "n3p2p" -> "nxxxrxxp"
  // we'll end up with structure that looks like [[{p, rank, file},{},{},...], [{},{},{},...], ...]
  // where p is either a single character piece type (p,n,r,b,q,k) or 'x' for empty space
  // white player starts at the bottom of the board (rank 8 (7 in 0-index array))
  let rows = parts[0].split('/');
  let board = rows.map(function(row, rank) {
    let cols = row.replace(/\d/g, digit => 'x'.repeat(parseInt(digit))).split('');
    return cols.map(function(piece, file) {
      let owner = null;
      if(piece !== 'x') {
        // uppercase letters are white, lowercase are black
        owner = /[PNBRQK]/.test(piece) ? 'w' : 'b';
      }
      // normalize the letters to make it easier to look up later
      return {p: piece.toLowerCase(), rank: rank, file: file, owner: owner};
    });
  });
  state.board = board;

  // active player
  state.playerTurn = parts[1];

  // castling availability
  let castling = {
    w: {k:false, q:false},
    b: {k:false, q:false}
  };
  if(parts[2] !== '-') {
    let available = parts[2].split('');
    available.forEach(function(a) {
      switch(a) {
        case 'K': castling.w.k = true; break;
        case 'Q': castling.w.q = true; break;
        case 'k': castling.b.k = true; break;
        case 'q': castling.b.q = true; break;
      }
    });
  }
  state.castling = castling;

  // previous move's en passant space
  if(parts[3] === '-') {
    state.enPassant = null;
  } else {
    state.enPassant = notationToRankFile(parts[3]);
  }

  // ignoring the rest of the file, not relevant to what we need to find moves
  return state;
};

// checks to see if position is within the bounds of the board
let onBoard = function(rank, file) {
  return rank >= 0 && rank <= 7 && file >= 0 && file <= 7;
};

// checks to see if position is not empty (empty spaces have null owner)
let pieceAt = function(rank, file, state) {
  return onBoard(rank, file) && state.board[rank][file].owner !== null;
};

// checks to see if position is not empty and target piece is owned by a specific player
let ownedPieceAt = function(rank, file, player, state) {
  return onBoard(rank, file) && state.board[rank][file].owner === player;
};

// checks to see if position is empty or contains an opponent's piece
let movableSpace = function(rank, file, player, state) {
  return onBoard(rank, file) && (state.board[rank][file].owner === null || state.board[rank][file].owner !== player);
};

// checks to see if position supports an 'en passant' attack
let enPassant = function(rank, file, state) {
  return state.enPassant !== null && state.enPassant[0] === rank && state.enPassant[1] === file;
};

// reusable symmetrical moveset functions
// generic names from https://en.wikipedia.org/wiki/Fairy_chess_piece

// pieces that jump over pieces (knight, king)
let leaper = function(dirs) {
  return function(p, state) {
    let rank = p.rank, file = p.file;

    // mirror all the directions, set requires strings :(
    let symmetricalDirs = dirs.reduce((set, dir) => {
      set.add(dir.toString());
      set.add([dir[0]*-1, dir[1]].toString());
      set.add([dir[0], dir[1]*-1].toString());
      set.add([dir[0]*-1, dir[1]*-1].toString());
      return set;
    }, new Set());

    // transform back from set format
    // filter out moves that aren't on the board
    // convert from relative movement to absolute positions
    let validMoves = Array.from(symmetricalDirs.values())
      .map(dirStr => dirStr.split(',').map(dir => parseInt(dir)))
      .filter(dir => movableSpace(rank+dir[0], file+dir[1], p.owner, state))
      .map(dir => [rank+dir[0], file+dir[1]]);

    return validMoves;
  };
};

// pieces move as long as nothing obstructs (rook, bishop, queen)
let rider = function(dirs) {
  return function(p, state) {
    let rank = p.rank, file = p.file;
    let opponent = p.owner === 'w' ? 'b' : 'w';

    // walk along direction starting from rank and file of surrounding scope
    let getAllSpacesInDir = function(dir) {
      let pos = [rank + dir[0], file + dir[1]];
      let spaces = [];

      // move until we get to a piece or the edge of the board
      while(onBoard(pos[0], pos[1]) && !pieceAt(pos[0], pos[1], state)) {
        spaces.push(pos.slice());
        pos[0] += dir[0];
        pos[1] += dir[1];
      }

      // check the piece we just hit, and add it if it is an opponent piece
      if(ownedPieceAt(pos[0], pos[1], opponent, state)) {
        spaces.push(pos.slice());
      }

      return spaces;
    }

    // mirror each direction over x and y
    let symmetricalDirs = dirs.reduce((set, dir) => {
      set.add(dir.toString());
      set.add([dir[0]*-1, dir[1]].toString());
      set.add([dir[0], dir[1]*-1].toString());
      set.add([dir[0]*-1, dir[1]*-1].toString());
      return set;
    }, new Set());

    // transform back from set strings
    // walk along directions and get all spaces
    let validMoves = Array.from(symmetricalDirs.values())
      .map(dirStr => dirStr.split(',').map(dir => parseInt(dir)))
      .reduce((arr, dir) => arr.concat(getAllSpacesInDir(dir)), []);

    return validMoves;
  };
};

// functions that take a piece and return possible moves for that piece
// these will be used later for each individual piece on the board
const rules = {
  // pawns have weird rules
  "p": function(p, state) {
    let moves = [];
    let rank = p.rank, file = p.file;
    let side = p.owner === 'w' ? -1 : 1;
    let opponent = p.owner === 'w' ? 'b' : 'w';

    // regular movement
    if(movableSpace(rank+side, file, opponent, state)) {
      moves.push([rank+side, file]);
    }

    // two space movement as first move
    if(side === 1 && rank === 1 && !pieceAt(rank+1, file, state)) {
      moves.push([rank+2, file]);
    } else if(side === -1 && rank === 6 && !pieceAt(rank-1, file, state)) {
      moves.push([rank-2, file]);
    }

    // attack movement including en passant
    if(ownedPieceAt(rank+side, file+1, opponent, state) || enPassant(rank+side, file+1, state)) {
      moves.push([rank+side, file+1]);
    }
    if(ownedPieceAt(rank+side, file-1, opponent, state) || enPassant(rank+side, file-1, state)) {
      moves.push([rank+side, file-1]);
    }

    return moves;
  },

  // knights jump 2,1 in any direction
  "n": leaper([[2,1], [1,2]]),

  // rooks slide horizontally
  "r": rider([[1,0], [0,1]]),

  // bishop slide diagonally
  "b": rider([[1,1]]),

  // queens slide in any direction
  "q": rider([[1,0], [0,1], [1,1]]),

  // kings jump directly to single space in any direction
  "k": leaper([[1,0], [0,1], [1,1]])
};

// finds all possible moves for the specified piece on the board
// output: [{piece, fromRank, fromFile, toRank, toFile}, ...]
let getOptionsForPiece = function(piece, state) {
  let movesForPiece = rules[piece.p](piece, state);
  return movesForPiece.map(move => ({piece: piece.p, fromRank: piece.rank, fromFile: piece.file, toRank: move[0], toFile: move[1]}));
};

// get castling moves for player
let getCastlingOptions = function(player, state) {
  let moves = [];
  let castling = state.castling[player];
  let rank = player === 'w' ? 7 : 0;

  // check that castling is still available (implies pieces involved haven't been moved yet)
  // and that the spaces in between are empty
  if(castling.k && !pieceAt(rank, 5, state) && !pieceAt(rank, 6, state)) {
    // kingside castle
    moves.push({piece: 'k', fromRank: rank, fromFile: 4, toRank: rank, toFile: 6, castle: true});
    moves.push({piece: 'r', fromRank: rank, fromFile: 7, toRank: rank, toFile: 5, castle: true});
  }
  if(castling.q && !pieceAt(rank, 1, state) && !pieceAt(rank, 2, state) && !pieceAt(rank, 3, state)) {
    // queenside castle
    moves.push({piece: 'k', fromRank: rank, fromFile: 4, toRank: rank, toFile: 2, castle: true});
    moves.push({piece: 'r', fromRank: rank, fromFile: 0, toRank: rank, toFile: 3, castle: true});
  }
  return moves;
};

// finds all possible moves for the specified player
// output: [{piece, fromRank, fromFile, toRank, toFile}, ...]
let getOptionsForPlayer = function(state, player) {
  // flattened piece list for player
  let playersPieces = state.board.reduce((pre, row) => pre.concat(row.filter(col => col.owner === player)), []);
  // concat together available moves for each piece
  let options = playersPieces.reduce((pre, piece) => pre.concat(getOptionsForPiece(piece, state)), []);
  options = options.concat(getCastlingOptions(player, state));
  return options;
};

// takes output of getOptionsForPiece and returns string formatted like
// "Pawn at <A:2> can move to <A:3>"
let formatMove = function(move) {
  let pieceNames = {
    'p': 'Pawn',
    'n': 'Knight',
    'r': 'Rook',
    'b': 'Bishop',
    'q': 'Queen',
    'k': 'King'
  };
  // 0->A, 7->H
  let rankFormat = (rank) => String.fromCharCode(rank+65);

  // format string, using some rotation/flipping to get
  // from easier to program with values to standardized chess notation
  let text = `${pieceNames[move.piece]} at <${rankFormat(move.fromFile)}:${8-move.fromRank}> can move to <${rankFormat(move.toFile)}:${8-move.toRank}>`;
  if(move.castle) {
    text += ' (as castling move)';
  }
  return text;
};



// actual program execution time
if(process.argv.length < 3) {
  console.log('SYNTAX: node chessmaster3000.js input-file-name.fen');
  return;
}

// handling cmd line input
let gameState = importFile(process.argv[2]);

// print individual moves
var moveOptions = getOptionsForPlayer(gameState, gameState.playerTurn);
moveOptions.forEach(opt => console.log(formatMove(opt)));

// print summary
let uniquePieceCount = Object.keys(moveOptions.reduce((pre, move) => {
    pre[move.piece+move.fromRank+move.fromFile] = true;
    return pre;
  }, {})).length;
let playerName = gameState.playerTurn === 'w' ? 'white' : 'black';
console.log(`${moveOptions.length} legal moves (${uniquePieceCount} unique pieces) for ${playerName} player`);

// all done!
