#!/usr/bin/env python3
"""AEX-4.16: bounded Actions ZIP transport, never generic extractall."""
import hashlib
import json
from pathlib import Path
import re
import stat
import sys
import unicodedata
import zipfile

MAX_ARCHIVE = 256 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
MAX_ENTRY = 256 * 1024 * 1024
MAX_FILES = 32


def extract(archive, destination, expected):
    source = Path(archive).resolve(strict=True)
    target = Path(destination).resolve(strict=True)
    if not target.is_dir() or any(target.iterdir()):
        raise ValueError("destination must be an existing empty owned directory")
    if source.stat().st_size > MAX_ARCHIVE:
        raise ValueError("archive too large")
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    expected_set = None if expected is None else set(expected)
    with zipfile.ZipFile(source) as bundle:
        entries = bundle.infolist()
        if not entries or len(entries) > MAX_FILES:
            raise ValueError("invalid entry count")
        names, folded, total = set(), set(), 0
        for entry in entries:
            name = entry.filename
            if entry.orig_filename != name:
                raise ValueError("truncated entry name")
            # Candidate/evidence bundles are deliberately flat. No directories,
            # links or nested metadata can be smuggled into the controller.
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,180}", name):
                raise ValueError("noncanonical entry name")
            if name.endswith((".", " ")) or re.match(r"(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)", name):
                raise ValueError("reserved entry name")
            key = unicodedata.normalize("NFC", name).casefold()
            if name in names or key in folded:
                raise ValueError("duplicate entry")
            names.add(name)
            folded.add(key)
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if entry.is_dir() or kind not in (0, stat.S_IFREG) or entry.flag_bits & 1:
                raise ValueError("nonregular or encrypted entry")
            if entry.file_size > MAX_ENTRY or entry.compress_size > MAX_ARCHIVE:
                raise ValueError("entry too large")
            total += entry.file_size
            if total > MAX_TOTAL:
                raise ValueError("expanded archive too large")
        if expected_set is not None and (len(expected) != len(expected_set) or names != expected_set):
            raise ValueError("unexpected or missing artifact files")
        if expected_set is None and ("candidate.json" not in names or any(n != "candidate.json" and not n.endswith(".tgz") for n in names)):
            raise ValueError("candidate artifact must contain only manifest and TGZs")
        for entry in entries:
            output = target / entry.filename
            if output.resolve().parent != target:
                raise ValueError("path escape")
            count = 0
            with bundle.open(entry) as stream, open(output, "xb") as writer:
                while True:
                    chunk = stream.read(65536)
                    if not chunk:
                        break
                    count += len(chunk)
                    if count > entry.file_size or count > MAX_ENTRY:
                        raise ValueError("stream size mismatch")
                    writer.write(chunk)
            if count != entry.file_size:
                raise ValueError("truncated entry")
    if hashlib.sha256(source.read_bytes()).hexdigest() != before:
        raise ValueError("archive changed during extraction")
    return sorted(names)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise ValueError("expected archive, destination and expected-file JSON arguments")
        expected_files = json.loads(sys.argv[3])
        if expected_files is not None and (not isinstance(expected_files, list) or not all(isinstance(n, str) for n in expected_files)):
            raise ValueError("invalid expected files")
        print(json.dumps({"files": extract(sys.argv[1], sys.argv[2], expected_files)}))
    except Exception as error:
        # Do not echo signed download URLs or arbitrary archive metadata.
        print("Artifact extraction refused: " + type(error).__name__, file=sys.stderr)
        sys.exit(1)
