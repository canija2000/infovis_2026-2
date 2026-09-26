"""Poll GBIF test download status (public endpoint, no auth needed).
Prints TERMINAL:<status> only when the download reached a final state;
otherwise prints PENDING:<status>. Used by the cron watcher.
"""
import json
import os
import urllib.request

KEY = "0008171-260921141020460"
STATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".test_watch.json")
TERMINAL = {"SUCCEEDED", "FAILED", "KILLED", "CANCELLED"}


def main():
    with urllib.request.urlopen(
        f"https://api.gbif.org/v1/occurrence/download/{KEY}", timeout=60
    ) as r:
        d = json.load(r)
    status = d.get("status", "UNKNOWN")
    prev = None
    if os.path.exists(STATE):
        prev = json.load(open(STATE)).get("status")
    json.dump({"status": status, "totalRecords": d.get("totalRecords"),
               "size": d.get("size"), "doi": d.get("doi")},
              open(STATE, "w"))
    if status in TERMINAL and prev != status:
        print(f"TERMINAL:{status} records={d.get('totalRecords')} "
              f"size={d.get('size')} doi={d.get('doi')}")
    else:
        print(f"PENDING:{status}")


if __name__ == "__main__":
    main()
