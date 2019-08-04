#!/usr/bin/perl

use DBI;
use Spreadsheet::ParseExcel::Simple qw();

my $library = "library.xls";
my $dbname = "library.sqlite";

my %paths;
my $dbh;

my %trackDetail;

#open(FILE, "<$file") or die "can't open $file\n";
#my @lines = <FILE>;
#close(FILE);

&processLines();
#&printLibrary();
#&printJSON();
#&printAlbumTrackJSON();

&createTable();
&insertTable();

#&createTree();
#&createJSTree();

sub connectDB {
  $dbh = DBI->connect(
      "dbi:SQLite:dbname=$dbname",
      "",
      "",
      { RaiseError => 1 },
  ) or die $DBI::errstr;
}

sub disconnectDB {
  $dbh->disconnect();
}

sub processLines {
  my $isFirst = 1;

############################## READ CSV DATA #################################

  my $xls = Spreadsheet::ParseExcel::Simple->read($library) or die "can't open $library\n";
  foreach my $sheet ($xls->sheets) {
    while ($sheet->has_data) {
#     my @data = $sheet->next_row;

      if ( $isFirst == 1) {
        $sheet->next_row;
        $isFirst = 0;
      } else {
        ($albumArtist, $album, $disc, $track, $title, $trackArtist, $composer, $externalId, $source, $isDup, $isHidden, $tags, $path) = $sheet->next_row;

        $albumArtist =~ s/^\"//;
        $albumArtist =~ s/\"$//;

        $albumArtist =~ s/\"/\\"/g;

        $album =~ s/^\"//;
        $album =~ s/\"$//;

        $album =~ s/\"/\\"/g;

        $title =~ s/^\"//;
        $title =~ s/\"$//;

        $title =~ s/\"/\\"/g;

        $path =~ s/^\"//;
        $path =~ s/\s*$//;
        $path =~ s/\"$//;

        $path =~ s/\"/\\"/g;

        $trackDetail{$path} = [$albumArtist, $album, $disc, $title];
      }
    }
  }

  ########################### SETUP FOLDER TREE ###############################

  my $pathToAdd;
  my $index = 1;
  my $lastIndex = 0;
  my @parent;
  my $lastLevel = 0;
  my $currentLevel = 0;
  my @curFullPath;
  my @forCurrentLevel;

  foreach my $curPath (sort keys %trackDetail) {
    if ( $curPath !~ m/^\s*$/ ) {

      @curFullPath = split /\//, $curPath;
      $pathToAdd = "";

      foreach my $latestPath (@curFullPath) {
        chomp($latestPath);

        if ( $latestPath !~ m/^\s*$/ ) {
          $pathToAdd = "${pathToAdd}\/$latestPath";

          if ( !$paths{$pathToAdd}) {
            @forCurrentLevel = split /\//, $pathToAdd;
            $currentLevel = $#forCurrentLevel;

            if ($lastLevel < $currentLevel) {
              $parent[$currentLevel] = $lastIndex;
            }

            $paths{$pathToAdd}{'index'} = $index;
            $paths{$pathToAdd}{'parent'} = $parent[$currentLevel];
            $paths{$pathToAdd}{'description'} = $latestPath;
            $paths{$pathToAdd}{'level'} = "Folder";
            $paths{$pathToAdd}{'path'} = $pathToAdd;

            $lastLevel = $currentLevel;
            $lastIndex = $index;
            $index++;
          }
        }
      }
    }
  }

  ########################## ARTIST/ALBUM/DISC/TRACK INFO #####################

  $isFirst = 1;

  $xls = Spreadsheet::ParseExcel::Simple->read($library) or die "can't open $library\n";
  foreach my $sheet ($xls->sheets) {
    while ($sheet->has_data) {
      if ( $isFirst == 1) {
        $sheet->next_row;
        $isFirst = 0;
      } else {
        ($albumArtist, $album, $disc, $track, $title, $trackArtist, $composer, $externalId, $source, $isDup, $isHidden, $tags, $path) = $sheet->next_row;

        $albumArtist =~ s/^\"//;
        $albumArtist =~ s/\"$//;

        $album =~ s/^\"//;
        $album =~ s/\"$//;

        $title =~ s/^\"//;
        $title =~ s/\"$//;

        $path =~ s/^\"//;
        $path =~ s/\s*$//;
        $path =~ s/\"$//;

        my $level = 0;
        my $hasDisc = 0;
        my @processedPath;

        @curFullPath = split /\//, $path;

        if ( $curFullPath[$#curFullPath - 1] =~ m/^(disc|disk|cd)?\s*\d+$/i ) {
          $hasDisc = 1;
        }

        $pathToAdd = "";
        foreach my $curPath (@curFullPath) {
          chomp($curPath);

          if ($curPath !~ m/^\s*$/) {
            $pathToAdd = "${pathToAdd}\/$curPath";

            if ( !$processedPath{$pathToAdd}) {
              if ( $level == $#curFullPath ) {
#               TRACK LEVEL
                $paths{$pathToAdd}{"artist"} = $albumArtist;
                $paths{$pathToAdd}{"album"} = $album;
                $paths{$pathToAdd}{"disc"} = $disc;
                $paths{$pathToAdd}{"track"} = $title;
                $paths{$pathToAdd}{"searchText"} = "";
                $paths{$pathToAdd}{"level"} = "Tracks";
                $paths{$pathToAdd}{"description"} = $curPath;
              } elsif ( $level == $#curFullPath - 1) {
                if ( $hasDisc == 1 ) {
#                 DISC LEVEL
                  $paths{$pathToAdd}{"artist"} = $albumArtist;
                  $paths{$pathToAdd}{"album"} = $album;
                  $paths{$pathToAdd}{"disc"} = $disc;
                  $paths{$pathToAdd}{"level"} = "Discs";
                  $paths{$pathToAdd}{"searchText"} = "";
                  $paths{$pathToAdd}{"description"} = $curPath;
                } else {
#                 ALBUM LEVEL
                  $paths{$pathToAdd}{"artist"} = $albumArtist;
                  $paths{$pathToAdd}{"album"} = $album;
                  $paths{$pathToAdd}{"searchText"} = $album;
                  $paths{$pathToAdd}{"level"} = "Albums";
                  $paths{$pathToAdd}{"description"} = $curPath;
                }
              } elsif ( $level == $#curFullPath - 2) {
                if ( $hasDisc == 1 ) {
#                 ALBUM LEVEL
                  $paths{$pathToAdd}{"artist"} = $albumArtist;
                  $paths{$pathToAdd}{"album"} = $album;
                  $paths{$pathToAdd}{"searchText"} = $album;
                  $paths{$pathToAdd}{"level"} = "Albums";
                  $paths{$pathToAdd}{"description"} = $curPath;
                } else {
#                 ARTIST LEVEL
                  $paths{$pathToAdd}{"artist"} = $albumArtist;
                  $paths{$pathToAdd}{"searchText"} = $albumArtist;
                  $paths{$pathToAdd}{"level"} = "Artists";
                  $paths{$pathToAdd}{"description"} = $curPath;
                }
              } elsif ( $level == $#curFullPath - 3 ) {
                if ( $hasDisc == 1 ) {
#                 ARTIST LEVEL
                  $paths{$pathToAdd}{"artist"} = $albumArtist;
                  $paths{$pathToAdd}{"searchText"} = $albumArtist;
                  $paths{$pathToAdd}{"level"} = "Artists";
                  $paths{$pathToAdd}{"description"} = $curPath;
                }
              }
            }
          }

          $level++;
        }
      }
    }
  }
}

sub printLibrary() {
  foreach my $curPath (sort keys %paths) {
    chomp($curPath);
    &printPath($curPath);
  }
}

sub printPath {
  my $curPath = @_[0];

  print "Lookup: $curPath\n";
  print " index: $paths{$curPath}{'index'}\n";
  print " parent: $paths{$curPath}{'parent'}\n";
  print " description: $paths{$curPath}{'description'}\n";
  print " searchText: $paths{$curPath}{'searchText'}\n";
  print " level: $paths{$curPath}{'level'}\n";
  print " path: $paths{$curPath}{'path'}\n";

  if ($paths{$curPath}{'level'} =~ m/Artists/) {
    print " artist: $paths{$curPath}{'artist'}\n";
  }

  if ($paths{$curPath}{'level'} =~ m/Albums/) {
    print " artist: $paths{$curPath}{'artist'}\n";
    print " album: $paths{$curPath}{'album'}\n";
  }

  if ($paths{$curPath}{'level'} =~ m/Discs/) {
    print " artist: $paths{$curPath}{'artist'}\n";
    print " album: $paths{$curPath}{'album'}\n";
    print " disc: $paths{$curPath}{'disc'}\n";
  }

  if ($paths{$curPath}{'level'} =~ m/Tracks/) {
    print " artist: $paths{$curPath}{'artist'}\n";
    print " album: $paths{$curPath}{'album'}\n";
    print " disc: $paths{$curPath}{'disc'}\n";
    print " track: $paths{$curPath}{'track'}\n";

  }
}

sub printJSON  {
  print "{\n";

  my $isFirst = 1;
  foreach my $curPath (sort keys %paths) {
    chomp($curPath);

    $paths{$curPath}{'track'} =~ s/\"//g;
    $paths{$curPath}{'album'} =~ s/\"//g;
    $paths{$curPath}{'artist'} =~ s/\"//g;

    if ( $isFirst == 1 ) {
      $isFirst = 0;
    } else {
      print ",\n";
    }

    print "    {\n";
    print "      \"path\":        \"$paths{$curPath}{'path'}\",\n";
    print "      \"id\":         $paths{$curPath}{'index'},\n";
    print "      \"parent\":      $paths{$curPath}{'parent'},\n";
    print "      \"description\": \"$paths{$curPath}{'description'}\",\n";
    print "      \"searchText\": \"$paths{$curPath}{'searchText'}\",\n";
    print "      \"artist\":      \"$paths{$curPath}{'artist'}\",\n";
    print "      \"album\":       \"$paths{$curPath}{'album'}\",\n";
    print "      \"disc\":        \"$paths{$curPath}{'disc'}\",\n";
    print "      \"title\":       \"$paths{$curPath}{'track'}\",\n";
    print "      \"level\":       \"$paths{$curPath}{'level'}\",\n";
    print "    }";
  }

  print "}\n";
}

sub insertTable  {
  my $insertStr;
  &connectDB();

  foreach my $curPath (sort keys %paths) {
    my $curChild = 0;
    my $desc = "";
    chomp($curPath);

    $paths{$curPath}{'track'} =~ s/\"//g;
    $paths{$curPath}{'album'} =~ s/\"//g;
    $paths{$curPath}{'artist'} =~ s/\"//g;

    my $trackUTF8 = $paths{$curPath}{'track'};
    my $albumUTF8 = $paths{$curPath}{'album'};
    my $artistUTF8 = $paths{$curPath}{'artist'};

    $trackUTF8 =~ s/[^[:ascii:]]//g;
    $albumUTF8 =~ s/[^[:ascii:]]//g;
    $artistUTF8 =~ s/[^[:ascii:]]//g;

    if ( $paths{$curPath}{'level'} !~ m/Tracks/) {
      $curChild = 1;
    }

    if ($paths{$curPath}{'level'} =~ m/Albums/) {
      $desc = $paths{$curPath}{'album'};
    } elsif ($paths{$curPath}{'level'} =~ m/Artists/) {
      $desc = $paths{$curPath}{'artist'};

    }

    $insertStr = "insert into roonLib (path, id, parent, description, searchText, " .
                 "artist, album, disc, title, artistUTF8, albumUTF8, " .
                 "titleUTF8, level, children) values ( " .
                 "\"$paths{$curPath}{'path'}\", " .
                 "$paths{$curPath}{'index'}, " .
                 "$paths{$curPath}{'parent'}, " .
                 "\"$paths{$curPath}{'description'}\", " .
                 "\"" . $desc . "\", " .
                 "\"$paths{$curPath}{'artist'}\", " .
                 "\"$paths{$curPath}{'album'}\", " .
                 "\"$paths{$curPath}{'disc'}\", " .
                 "\"$paths{$curPath}{'track'}\", " .
                 "\"$artistUTF8\", " .
                 "\"$albumUTF8\", " .
                 "\"$trackUTF8\", " .
                 "\"$paths{$curPath}{'level'}\", " .
                 "$curChild )";

    $dbh->do($insertStr);
  }

  &disconnectDB();
}

sub createTable {
  my $createString = "create table roonLib ( " .
                     "id integer not null, " .
  	                 "parent integer, " .
  	                 "description TEXT(64,0), " .
                     "searchText TEXT(64,0), " .
  	                 "artist TEXT(64,0), " .
  	                 "album TEXT(64,0), " .
  	                 "disc TEXT(8,0), " .
  	                 "title TEXT(64,0), " .
                     "path TEXT(512,0), " .
                     "children boolean, " .
                     "artistUTF8 TEXT(64,0), " .
  	                 "albumUTF8 TEXT(64,0), " .
                     "titleUTF8 TEXT(64,0), " .
  	                 "level TEXT(16,0) )";

  &connectDB();
  $dbh->do("DROP TABLE IF EXISTS roonLib");
  $dbh->do($createString);
  &disconnectDB();

}

sub createTree {
  &connectDB();
  &treeLevel(0);
  &disconnectDB();
}

sub createJSTree {
  &connectDB();
  &jsTree();
  &disconnectDB();
}

sub treeLevel {
  my $parentID = @_[0];

  my $sth = $dbh->prepare( "SELECT path, id, parent, description, searchText, artist, album, disc, title, level FROM roonLib where parent = $parentID order by id" );
  my $rc = $sth->execute() or die "Can't execute statement: $DBI::errstr";
  my $isFirst = 1;

  while (my($path, $id, $parent, $description, $searchText, $artist, $album, $disc, $title, $level) = $sth->fetchrow()) {
    if ( $isFirst == 0) {
      print ",\n";
    } else {
      print "\n";
      $isFirst = 0;
    }

    print "{\n";
    print "\"name\": \"$description\",\n";
    print "\"searchText\": \"$searchText\",\n";
    print "\"path\": \"$path\",\n";
    print "\"id\": \"$id\",\n";
    print "\"parent\": \"$parent\",\n";
    print "\"artist\": \"$artist\",\n";
    print "\"album\": \"$album\",\n";
    print "\"disc\": \"$disc\",\n";
    print "\"title\": \"$title\",\n";
    print "\"level\": \"$level\",\n";

    if ( $level !~ m/Tracks/i ) {
      print "\"type\": \"dir\",\n";

      print "\"children\": [\n";
      &treeLevel($id);
      print "]\n";
    } else {
      print "\"type\": \"file\"\n";
    }
    print "}\n";
  }
}

sub jsTree {
  my $parentID = @_[0];

  my $sth = $dbh->prepare( "SELECT path, id, parent, description, searchText, artist, album, disc, title, level, children FROM roonLib order by id" );
  my $rc = $sth->execute() or die "Can't execute statement: $DBI::errstr";
  my $isFirst = 1;
  print "[\n";
  while (my($path, $id, $parent, $description, $searchText, $artist, $album, $disc, $title, $level, $children) = $sth->fetchrow()) {
    if ( $isFirst == 0) {
      print ",\n";
    } else {
      print "\n";
      $isFirst = 0;
    }

    print "{\n";

    print "\"parent\": \"$parent\",\n";
    print "\"text\": \"$description\",\n";
#    print "\"searchText\": \"$searchText\",\n";
    print "\"path\": \"$path\",\n";
    print "\"level\": \"$level\",\n";
    print "\"children\": $children,\n";
    print "\"state\": {\n";
    print "\"opened\": false,\n";
    print "\"disabled\": false,\n";
    print "\"selected\": false\n";
    print "},\n";
    print "\"li_attr\": {},\n";
    print "\"a_attr\": {}\n";

    print "}";
  }
  print "]\n";
}

sub printAlbumTrackJSON {
  my $isFirst = 1;
  print "{\n";

  foreach my $curPath (sort keys %trackDetail) {
    if ( $curPath !~ m/^\s*$/ ) {
      if ( $isFirst == 1 ) {
        $isFirst = 0;
      } else {
        print ",\n";
      }

      $paths{$curPath}{'track'} =~ s/\"//g;
      $paths{$curPath}{'album'} =~ s/\"//g;
      $paths{$curPath}{'artist'} =~ s/\"//g;

      print "  \"$paths{$curPath}{'album'} - $paths{$curPath}{'track'}\":";
      print "  {\n";
      print "    \"artist\": \"$paths{$curPath}{'artist'}\",\n";
      print "    \"album\": \"$paths{$curPath}{'album'}\",\n";
      print "    \"track\": \"$paths{$curPath}{'track'}\",\n";
      print "    \"path\": \"$curPath\"\n";
      print "  }";
    }
  }

  print "\n}\n";
}
