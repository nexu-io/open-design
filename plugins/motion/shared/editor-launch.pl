use strict;
use warnings;
use Fcntl qw(:DEFAULT :flock F_SETFD);
use Errno qw(EWOULDBLOCK EAGAIN);

# macOS ships Perl; exec Node with an inherited flock, without a resident Perl supervisor.
my ($root, $node, $entry) = @ARGV;
my $runtime = "$root/.editor-runtime";
die "Editor directory belongs to another user\n" unless (stat($runtime))[4] == $<;
$^F = 255;
sysopen(my $lock, "$runtime/runtime.lock", O_CREAT | O_RDWR | O_NOFOLLOW, 0600) or die "Open editor lock: $!\n";
unless (flock($lock, LOCK_EX | LOCK_NB)) {
    exit 0 if $! == EWOULDBLOCK || $! == EAGAIN;
    die "Lock editor: $!\n";
}
fcntl($lock, F_SETFD, 0) or die "Inherit editor lock: $!\n";
$ENV{OPENMOTION_EDITOR_LOCK_FD} = fileno($lock);
exec {$node} $node, '--experimental-strip-types', $entry, '--serve', $root;
die "Start editor: $!\n";
