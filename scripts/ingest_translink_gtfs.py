#!/usr/bin/env python3
"""Import the train services and geometry from Translink's official SEQ GTFS feed."""
import argparse
import csv
import datetime as dt
import hashlib
import io
import sqlite3
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'data/trainsim.sqlite'
FEED_URL = 'https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip'
HOLIDAY_URL = 'https://www.qld.gov.au/recreation/travel/holidays/public'
ATTRIBUTION = 'Translink SEQ GTFS, licensed under CC BY 4.0'
ENGINES = tuple(f'QR-EMU-{i:02}' for i in range(1, 7))


def csv_rows(archive, name):
    with io.TextIOWrapper(archive.open(name), encoding='utf-8-sig', newline='') as stream:
        yield from csv.DictReader(stream)


def gtfs_seconds(value):
    hours, minutes, seconds = (int(part) for part in value.split(':'))
    if minutes > 59 or seconds > 59 or hours < 0:
        raise ValueError(f'Invalid GTFS time: {value}')
    return hours * 3600 + minutes * 60 + seconds


def easter_sunday(year):
    """Gregorian Easter date (Meeus/Jones/Butcher)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = (h + l - 7 * m + 114) % 31 + 1
    return dt.date(year, month, day)


def qld_holidays(year):
    """Queensland statewide holidays plus Brisbane's RNA Show Day, by official rules."""
    rows = []

    def add(day, name, region='Queensland', kind='full-day', start=None, end=None):
        rows.append((day.isoformat(), name, region, kind, start, end, HOLIDAY_URL))

    def monday_observed(day):
        return day + dt.timedelta(days=2 if day.weekday() == 5 else 1)

    new_year = dt.date(year, 1, 1)
    add(new_year, "New Year's Day")
    if new_year.weekday() >= 5:
        add(monday_observed(new_year), "New Year's Day (additional public holiday)")

    australia_day = dt.date(year, 1, 26)
    add(australia_day, 'Australia Day')
    if australia_day.weekday() >= 5:
        add(monday_observed(australia_day), 'Australia Day (observed)')

    easter = easter_sunday(year)
    add(easter - dt.timedelta(days=2), 'Good Friday')
    add(easter - dt.timedelta(days=1), 'The day after Good Friday')
    add(easter, 'Easter Sunday')
    add(easter + dt.timedelta(days=1), 'Easter Monday')

    anzac = dt.date(year, 4, 25)
    add(anzac, 'Anzac Day')
    if anzac.weekday() == 6:
        add(anzac + dt.timedelta(days=1), 'Anzac Day (observed)')

    first_may = dt.date(year, 5, 1)
    add(first_may + dt.timedelta(days=(7 - first_may.weekday()) % 7), 'Labour Day')
    first_friday = dt.date(year, 8, 1)
    first_friday += dt.timedelta(days=(4 - first_friday.weekday()) % 7)
    if first_friday.day < 5:
        first_friday += dt.timedelta(days=7)
    add(first_friday + dt.timedelta(days=5), 'Royal Queensland Show Day', 'Brisbane')

    first_october = dt.date(year, 10, 1)
    add(first_october + dt.timedelta(days=(7 - first_october.weekday()) % 7), "King's Birthday")

    christmas_eve = dt.date(year, 12, 24)
    add(christmas_eve, 'Christmas Eve', kind='part-day', start='18:00', end='24:00')
    christmas = dt.date(year, 12, 25)
    boxing = dt.date(year, 12, 26)
    add(christmas, 'Christmas Day')
    add(boxing, 'Boxing Day')
    occupied = {christmas, boxing}
    for holiday, name in ((christmas, 'Christmas Day'), (boxing, 'Boxing Day')):
        if holiday.weekday() >= 5:
            observed = holiday + dt.timedelta(days=1)
            while observed.weekday() >= 5 or observed in occupied:
                observed += dt.timedelta(days=1)
            occupied.add(observed)
            add(observed, f'{name} (additional public holiday)')
    return rows


def ensure_schema(con):
    con.executescript((ROOT / 'db/trainsim/schema.sql').read_text())


def ingest_archive(con, archive_path, *, fetched_at=None, source_url=FEED_URL):
    fetched_at = fetched_at or dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    feed_bytes = Path(archive_path).read_bytes()
    with zipfile.ZipFile(io.BytesIO(feed_bytes)) as archive:
        route_rows = [r for r in csv_rows(archive, 'routes.txt') if r['route_type'] == '2']
        rail_route_ids = {r['route_id'] for r in route_rows}
        trip_rows = [r for r in csv_rows(archive, 'trips.txt') if r['route_id'] in rail_route_ids]
        if not trip_rows:
            raise ValueError('The Translink feed contains no train trips (route_type=2)')
        if any(not r.get('shape_id') for r in trip_rows):
            raise ValueError('The Translink train feed contains trips without shape_id')

        trip_ids = {r['trip_id'] for r in trip_rows}
        service_ids = {r['service_id'] for r in trip_rows}
        shape_ids = {r['shape_id'] for r in trip_rows}
        trip_engines = {r['trip_id']: ENGINES[index % len(ENGINES)]
                        for index, r in enumerate(sorted(trip_rows, key=lambda row: row['trip_id']))}

        calendar_rows = {r['service_id']: r for r in csv_rows(archive, 'calendar.txt')
                         if r['service_id'] in service_ids}
        date_rows = [r for r in csv_rows(archive, 'calendar_dates.txt')
                     if r['service_id'] in service_ids]
        exceptions_by_service = {}
        for row in date_rows:
            exceptions_by_service.setdefault(row['service_id'], []).append(row['date'])
        for service_id in service_ids - calendar_rows.keys():
            dates = exceptions_by_service.get(service_id, [])
            if not dates:
                raise ValueError(f'Trip service {service_id!r} has no calendar definition')
            calendar_rows[service_id] = {
                'service_id': service_id, **{day: '0' for day in
                    ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')},
                'start_date': min(dates), 'end_date': max(dates),
            }

        train_times = []
        stop_ids = set()
        trip_bounds = {}
        for row in csv_rows(archive, 'stop_times.txt'):
            if row['trip_id'] not in trip_ids:
                continue
            arrival = gtfs_seconds(row['arrival_time'])
            departure = gtfs_seconds(row['departure_time'])
            sequence = int(row['stop_sequence'])
            stop_ids.add(row['stop_id'])
            train_times.append((row['trip_id'], sequence, row['stop_id'], arrival, departure))
            bound = trip_bounds.setdefault(row['trip_id'], [sequence, arrival, sequence, departure])
            if sequence < bound[0]:
                bound[0], bound[1] = sequence, arrival
            if sequence > bound[2]:
                bound[2], bound[3] = sequence, departure
        if set(trip_bounds) != trip_ids:
            missing = len(trip_ids - trip_bounds.keys())
            raise ValueError(f'{missing} train trips have no stop_times')
        if any(start >= end for _, start, _, end in trip_bounds.values()):
            raise ValueError('A train trip has invalid stop-time bounds')

        stops = [(r['stop_id'], r.get('stop_code') or None, r['stop_name'],
                  float(r['stop_lat']), float(r['stop_lon']),
                  r.get('parent_station') or None, r.get('platform_code') or None)
                 for r in csv_rows(archive, 'stops.txt') if r['stop_id'] in stop_ids]
        if len({r[0] for r in stops}) != len(stop_ids):
            raise ValueError('Some train stop_times refer to missing stops')

        shape_points = [(r['shape_id'], int(r['shape_pt_sequence']),
                         float(r['shape_pt_lat']), float(r['shape_pt_lon']))
                        for r in csv_rows(archive, 'shapes.txt') if r['shape_id'] in shape_ids]
        shape_counts = {}
        for shape_id, *_ in shape_points:
            shape_counts[shape_id] = shape_counts.get(shape_id, 0) + 1
        if any(shape_counts.get(shape_id, 0) < 2 for shape_id in shape_ids):
            raise ValueError('One or more train shapes have fewer than two points')

        service_days = {
            service_id: tuple(int(row[day]) for day in
                ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'))
            for service_id, row in calendar_rows.items()
        }
        service_min = min(row['start_date'] for row in calendar_rows.values())
        service_max = max(row['end_date'] for row in calendar_rows.values())
        now_year = dt.date.today().year
        holidays = [holiday for year in range(now_year - 2, now_year + 5)
                    for holiday in qld_holidays(year)]

        con.execute('PRAGMA foreign_keys=ON')
        ensure_schema(con)
        try:
            con.execute('BEGIN')
            for table in ('translink_stop_time', 'translink_trip', 'translink_shape_point',
                          'translink_stop', 'translink_service_date', 'translink_service',
                          'translink_route', 'sim_public_holiday', 'translink_feed'):
                con.execute(f'DELETE FROM {table}')

            con.executemany('''INSERT INTO translink_route
                (route_id, short_name, long_name, description, route_type, url, colour, text_colour)
                VALUES (?, ?, ?, ?, 2, ?, ?, ?)''',
                [(r['route_id'], r.get('route_short_name') or None, r.get('route_long_name') or None,
                  r.get('route_desc') or None, r.get('route_url') or None,
                  r.get('route_color') or None, r.get('route_text_color') or None) for r in route_rows])
            con.executemany('''INSERT INTO translink_service
                (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, start_date, end_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                [(sid, *service_days[sid], row['start_date'], row['end_date'])
                 for sid, row in calendar_rows.items()])
            con.executemany('INSERT INTO translink_service_date VALUES (?, ?, ?)',
                            [(r['service_id'], r['date'], int(r['exception_type'])) for r in date_rows])
            con.executemany('''INSERT INTO translink_stop
                (stop_id, stop_code, name, lat, lon, parent_station, platform_code)
                VALUES (?, ?, ?, ?, ?, ?, ?)''', stops)
            con.executemany('''INSERT INTO translink_trip
                (trip_id, route_id, service_id, headsign, direction_id, shape_id, train_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
                [(r['trip_id'], r['route_id'], r['service_id'], r.get('trip_headsign') or None,
                  int(r['direction_id']) if r.get('direction_id') else None, r['shape_id'],
                  trip_engines[r['trip_id']]) for r in trip_rows])
            con.executemany('INSERT INTO translink_stop_time VALUES (?, ?, ?, ?, ?)', train_times)
            con.executemany('INSERT INTO translink_shape_point VALUES (?, ?, ?, ?)', shape_points)
            con.executemany('INSERT INTO sim_public_holiday VALUES (?, ?, ?, ?, ?, ?, ?)', holidays)
            con.execute('''INSERT INTO translink_feed
                (feed_id, source_url, fetched_at, sha256, feed_start, feed_end, attribution)
                VALUES (1, ?, ?, ?, ?, ?, ?)''',
                (source_url, fetched_at, hashlib.sha256(feed_bytes).hexdigest(),
                 service_min, service_max, ATTRIBUTION))
            con.commit()
        except Exception:
            con.rollback()
            raise

    return {'routes': len(route_rows), 'trips': len(trip_rows), 'stop_times': len(train_times),
            'stops': len(stops), 'shapes': len(shape_counts), 'exceptions': len(date_rows),
            'holidays': len(holidays), 'feed_start': service_min, 'feed_end': service_max}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--feed', type=Path, help='Use an already-downloaded GTFS ZIP')
    parser.add_argument('--source-url', default=FEED_URL,
                        help='URL to record as the source for a supplied feed archive')
    args = parser.parse_args(argv)
    args.db.parent.mkdir(parents=True, exist_ok=True)
    feed_path = args.feed
    source_url = FEED_URL
    if feed_path is None:
        with tempfile.NamedTemporaryFile(suffix='.zip') as downloaded:
            request = urllib.request.Request(FEED_URL, headers={'User-Agent': 'TrainSim/1.0'})
            with urllib.request.urlopen(request, timeout=120) as response:
                while chunk := response.read(1024 * 1024):
                    downloaded.write(chunk)
            downloaded.flush()
            con = sqlite3.connect(args.db)
            try:
                print(ingest_archive(con, downloaded.name, source_url=source_url))
            finally:
                con.close()
        return

    con = sqlite3.connect(args.db)
    try:
        print(ingest_archive(con, feed_path, source_url=args.source_url))
    finally:
        con.close()


if __name__ == '__main__':
    try:
        main()
    except (OSError, sqlite3.Error, ValueError, zipfile.BadZipFile) as error:
        print(f'Translink GTFS import failed: {error}', file=sys.stderr)
        raise SystemExit(1) from error
