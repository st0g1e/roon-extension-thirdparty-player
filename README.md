# roon-extension-thirdparty-player
```diff
- Currently plays to Audirvana 3.5 only
- Extension only tested on MacOS
```

## Installing/Preparing the library excel document
* Sqlite3
  1. Install sqlite3
  2. add empty sqlite file on the repository:
     - cd to the Repository
     - `touch library.sqlite`

* Roon:
  1. Enable search by path: [Roon KB](https://kb.roonlabs.com/FAQ:How_can_I_find_tracks_by_path%3F)
  2. Go to Track View
  3. Select all Tracks
  4. Export to excel

* Microsoft Excel
  1. Open the exported Library
  2. Save As the libary as: Excel 97-2004 Workbook (.xls) and name it "libary.xls"
  3. Copy library.xls to the repository folder

* Terminal
  1. run the perl script `./convertXLS.pl`

## Running
* Terminal
  1. update/install npm `npm install`
  2. run node `node .`

* Third Party application.
  1. Run the application

* Roon
  1. Go to extension page at Settings -> extension
  2. Click Settings on the setting for "roon-thirdparty"
  3. Select "Yes" on the "Use Third Party Player" option
  4. Select the Zone to send the playing track to the third party application

## Folder Viewing
* Web Browser
  1. Go to: [hierarchy page](http://localhost:3001/hierarchy.html)

## Warning
1. Only tested to run on Audirvana version 3.5
2. Repository only tested on MacOS (core at either local mac or roon Rock)
3. Ensure that the path on libary.xls is accessible from the extension repository
