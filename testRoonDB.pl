#!/usr/bin/perl

use DBI;
use LWP::Simple qw/get/;
use JSON;

my $dbname = "library.sqlite";
my $dbh;

my $topURL = "http://localhost:3001/roonAPI";
my $zone = "";


&test();

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

sub test() {
  &connectDB();

  &getZone();
# &testArtist();
  &testAlbum();
#  &testAlbumArtistDB();
#  &testById();

  &disconnectDB();
}

sub getZone {
  my $url = $topURL . "/listZones";
  my $content = get $url || die "Couldn't get $url";

  $json = decode_json($content);

  foreach my $curzone (sort keys $json->{zones}) {
    chomp($curzone);
    $zone = $curzone;
  }
}

sub testArtist {
  my $url;
  my $content;
  my $json;

  my $sth = $dbh->prepare( "SELECT id, description FROM roonLib where level='Artists' order by id" );
  my $rc = $sth->execute() or die "Can't execute statement: $DBI::errstr";

  while (my($id, $artist) = $sth->fetchrow()) {
    $url = $topURL . "/searchByNodeID?id=" . $id . "&zoneId=" . $zone . "&msk=545232";

    $content = get $url || die "Couldn't get $url";
    $json = decode_json($content);

    if ($artist !~ m/^$json->{list}[0]->{title}$/ || $json->{list}[0]->{title} != m/^$artist$/ ) {
      print "FAILED: $artist: " . $json->{list}[0]->{title} . ", ID:" . $id . "\n";

        if ($json->{list}[0]->{title} =~ m/not found/) {
#          &removeDescription($id);
        }
    }
  }
}

sub testAlbum {
  my $url;
  my $content;
  my $json;

  my $sth = $dbh->prepare( "SELECT path, id, parent, description, artist, album, disc, title, level, children FROM roonLib where level='Albums' order by id" );
  my $rc = $sth->execute() or die "Can't execute statement: $DBI::errstr";

  while (my($path, $id, $parent, $description, $artist, $album, $disc, $title, $level, $children) = $sth->fetchrow()) {
    $url = $topURL . "/searchByNodeID?id=" . $id . "&zoneId=" . $zone . "&msk=545232";

    $content = get $url || die "Couldn't get $url";
    $json = decode_json($content);

    if ($album !~ m/^$json->{list}[0]->{title}$/ || $json->{list}[0]->{title} != m/^$artist$/ ) {
      print "FAILED ALBUM: $album (" . $id . "): " . $json->{list}[0]->{title} . " ( " . $json->{list}[0]->{subtitle} . " )\n";

      if ($json->{list}[0]->{title} =~ m/not found/) {
#        &removeDescription($id);
      }
    }
  }
}

sub testAlbumArtistDB {
  my $sth;
  my $src;

  open(FILE, "<albumtrack.txt") or die "can't open albumtrack.txt\n";
  @albrack = <FILE>;
  close(FILE);

  foreach my $curAlbrack (@albrack) {
    chomp($curAlbrack);

    ($album,$track) = split(/\|\|\|/, $curAlbrack);
    $album =~ s/[^[:ascii:]]//g;

    $track =~ s/[^[:ascii:]]//g;

#    print "$curAlbrack:  ($album|$track)\n";

    $sth = $dbh->prepare( "SELECT artist, album, title FROM roonLib where albumUTF8=\"$album\" and titleUTF8=\"$track\"" );
    $rc = $sth->execute() or die "Can't execute statement: $DBI::errstr";

    print ")\n($album|$track) -> (";
    while (my($artistDB, $albumDB, $titleDB) = $sth->fetchrow()) {
      print "$artistDB|$albumDB|$titleDB";
    }
  }

  print ")\n";
}

sub testById {
  my $sth;
  my $src;

  $sth = $dbh->prepare( "SELECT artist, album, title FROM roonLib where id=131" );
  $rc = $sth->execute() or die "Can't execute statement: $DBI::errstr";

  while (my($artistDB, $albumDB, $titleDB) = $sth->fetchrow()) {
    print "($artistDB|$albumDB|$titleDB\n)";
  }
}

sub removeDescription {
  my $id = @_[0];

#  $stmt = "UPDATE roonLib SET description='' WHERE id = $id";
#  my $rv = $dbh->do($stmt) or die $DBI::errstr;
}
