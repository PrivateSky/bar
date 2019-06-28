# bar module
"bar" files are a replacement for tar, tar.gz, zip file format. We say that is "Brick based" because the storage of files in the archive is based on the concept of a "brick". A brick is a buffer of limited length (typical less then 100KB). A small file is represented with a brick but a larger file is represented as a set of bricks. The bar archive has a header that keeps the relation between files and bricks. A brick is identified by its hash (SHA2).

Compared with tar or zip files, the bar achive is designed to 
```
  - extend the idea of a localy stored file (still posibile) with the idea that a file is stored as 
  bricks on a network storage of bricks (could be our own storage, IPFS, etc)
  - allow easy access of a file (both for reading and wrinting) without loading in memory (or from the 
  network) the entire archivbe
  - allow compression and encryption per file
```

This module provides both a reusable library, zero dependencies and a command line for archiving, compression and encryption of files and folders.

# Use bar main citizens: archives and storageProviders

The main type of objects that can be created is a bar archive, using the newArchive or loadArchive functions exported by the module. In implementation newArchive and loadArchive are synonims, as when trying to load an archive that does not exist, it will create it.


```javascript
// load an archive 
loadArchive(name, storageProvider, autosave);
newArchive(name, storageProvider, autosave);

// add a folder
addFolder(folderName,callback);
// append content to a file
appendToFile(fileName, buffer|readStream, callback);
// replace file
replaceFile(fileName, buffer|readStream, callback);
//get a read stream
getFile(fileName, callback);
//get a read stream
getReadStream(fileName);
//geta a write stream
getWriteStream(fileName);
//save the bar in the storageProvider
arh.store(callback)
//list all the files in the bar
arh.list(callback)

//
loadSync(callback)
readFileSync() : string
writeFileSync(string|buffer)

```

A storage provider can be on of these:

 FolderBrickStorageProvider : stores bricks in separate files in a folder
 
 SingleFileStorageProvider  : stores bricks in a single file
 
 CacheEDFSStorageProvider: privateSky's EDFS bricks storage provider plus local cache
 
 EDFSStorageProvider: privateSky's EDFS bricks storage provider

# Use bar as a node module to create or update
```javascript
var barModule = require("bar");

var arh = barModule.newArchive(name, storageProvider);

arh.addFolder(folderName);
arh.appendToFile(fileName, buffer|readStream);

arh.getReadStream(fileName);
arh.getWriteStream(fileName);


arh.store()
```

# Use bar as a node module to load, update, change
```javascript
var barModule = require("bar");
var arh = barModule.loadArchive(name, storageProvider);

arh.addFolder(folderName);
arh.appendToFile(fileName, buffer|readStream);
arh.replaceFile(fileName, buffer|readStream);

arh.getReadStream(fileName);
arh.getWriteStream(fileName);

//storage provider can be FolderBrickStorageProvider, SingleFileStorageProvider, EDFSStorageProvider
arh.store()

```


# Use bar as command line
bar command line have the options cfxtz very similar with tar commands in the unix systems:
```
  -c is for create
  -f is to specify a name of the archive
  -x is to specify extract
  -t is to specify to list the files
  -z is to specify that each brick will be compressed (lzip)
```

Additionaly it has some other operation modifiers
```
--key key
    encrypt the header with the key, encrypt the bricks with different random keys. 
    By default there is no encryption.
      --usage
    give a short usage message
      --version
    print program version
```

```bash
#create a name.bar arhive containg files from folderName
bar -cf name.bar folderName 

#extract files from name.bar arhive into the folderName or in 
#current folder if folderName does not exist
bar -x name.bar folderName 


#list files
bar -t name.bar 

#create a name.bar arhive containg files from folderName, compress andencrypt
bar -czf name.bar folderName --key someKey

```


