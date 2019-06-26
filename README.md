# bar
"bar" files are a replacement for tar, tar.gz, zip file format. We say that is "Brick based" because the storage of files in the archive is based on the concept of a "brick". A brick is a buffer of limited length (typical less then 100KB). A small file is represented with a brick but a larger file is represented as a set of bricks. The bar archive has a header that keeps the relation between files and bricks. A brick is identified by its hash (SHA2).

Compared with tar or zip files, the bar achive is designed to 
  - extend the idea of a localy stored file (still posibile) with the idea that a file is stored as bricks on a network storage of bricks (could be our own storage, IPFS, etc)
  - allow easy access of a file (both for reading and wrinting) without loading in memory (or from the network) the entire archivbe
  - allow compression and encryption per file

This module provides both a reusable library, zero dependencies and a command line for archiving, compression and encryption of files and folders.

# use bar as a node module

# use bar as comamnd line




