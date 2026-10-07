// The files installed apps update themselves from, by name: what a
// release signs and latest.json lists. A Mac updates from its app packed
// in a .tar.gz; Windows and Linux from their installers.

export const UPDATE_FILE = /(\.app\.tar\.gz|-setup\.exe|\.msi|\.deb|\.rpm|\.AppImage)$/;

export const isUpdateFile = (name) => UPDATE_FILE.test(name);
