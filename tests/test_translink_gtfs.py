import csv
import io
import sqlite3
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from ingest_translink_gtfs import gtfs_seconds, ingest_archive, qld_holidays


class TranslinkGtfsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.feed = Path(self.temp.name) / 'feed.zip'
        with zipfile.ZipFile(self.feed, 'w') as archive:
            archive.writestr('routes.txt', self.csv(
                ['route_id', 'route_short_name', 'route_long_name', 'route_type'],
                [['train-a', 'T1', 'Central - North', '2'],
                 ['bus-a', '100', 'Bus route', '3']]))
            archive.writestr('trips.txt', self.csv(
                ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id'],
                [['train-a', 'weekday', 'trip-1', 'North', '0', 'shape-1']]))
            archive.writestr('calendar.txt', self.csv(
                ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
                 'saturday', 'sunday', 'start_date', 'end_date'],
                [['weekday', '1', '1', '1', '1', '1', '0', '0', '20261024', '20261223']]))
            archive.writestr('calendar_dates.txt', self.csv(
                ['service_id', 'date', 'exception_type'],
                [['weekday', '20261103', '2'], ['weekday', '20261104', '1']]))
            archive.writestr('stops.txt', self.csv(
                ['stop_id', 'stop_code', 'stop_name', 'stop_lat', 'stop_lon', 'parent_station', 'platform_code'],
                [['stop-a', 'A', 'Central', '-27.47', '153.02', '', '1'],
                 ['stop-b', 'B', 'North', '-27.45', '153.02', '', '2']]))
            archive.writestr('stop_times.txt', self.csv(
                ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
                [['trip-1', '23:55:00', '23:56:00', 'stop-a', '1'],
                 ['trip-1', '24:15:00', '24:16:00', 'stop-b', '2']]))
            archive.writestr('shapes.txt', self.csv(
                ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
                [['shape-1', '-27.47', '153.02', '1'], ['shape-1', '-27.45', '153.02', '2']]))
        self.db_path = Path(self.temp.name) / 'world.sqlite'

    @staticmethod
    def csv(header, rows):
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(header)
        writer.writerows(rows)
        return output.getvalue()

    def test_imports_train_schedule_and_excludes_nonrail_routes(self):
        with sqlite3.connect(self.db_path) as con:
            stats = ingest_archive(con, self.feed, fetched_at='2026-10-25T00:00:00Z')
            self.assertEqual(stats['routes'], 1)
            self.assertEqual(stats['trips'], 1)
            self.assertEqual(stats['stop_times'], 2)
            self.assertEqual(stats['shapes'], 1)
            self.assertEqual(con.execute('SELECT count(*) FROM translink_route').fetchone()[0], 1)
            self.assertEqual(con.execute('SELECT train_id FROM translink_trip').fetchone()[0], 'QR-EMU-01')
            self.assertEqual(con.execute('SELECT arrival_seconds FROM translink_stop_time ORDER BY stop_sequence DESC').fetchone()[0],
                             24 * 3600 + 15 * 60)
            self.assertEqual(con.execute('SELECT count(*) FROM translink_service_date').fetchone()[0], 2)
            self.assertEqual(len(con.execute('SELECT sha256 FROM translink_feed').fetchone()[0]), 64)
            self.assertEqual(con.execute('SELECT source_url FROM translink_feed').fetchone()[0],
                             'https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip')
            self.assertGreater(con.execute('SELECT count(*) FROM sim_public_holiday').fetchone()[0], 0)

            ingest_archive(con, self.feed, fetched_at='2026-10-26T00:00:00Z')
            self.assertEqual(con.execute('SELECT count(*) FROM translink_trip').fetchone()[0], 1)
            self.assertEqual(con.execute('SELECT fetched_at FROM translink_feed').fetchone()[0],
                             '2026-10-26T00:00:00Z')

    def test_gtfs_times_support_after_midnight(self):
        self.assertEqual(gtfs_seconds('26:30:15'), 26 * 3600 + 30 * 60 + 15)
        with self.assertRaises(ValueError):
            gtfs_seconds('25:60:00')

    def test_queensland_holiday_rules_match_published_dates(self):
        holidays = {(date, name) for date, name, *_ in qld_holidays(2026)}
        self.assertIn(('2026-08-12', 'Royal Queensland Show Day'), holidays)
        self.assertIn(('2026-04-03', 'Good Friday'), holidays)
        self.assertIn(('2026-12-24', 'Christmas Eve'), holidays)
        holidays_2022 = {(date, name) for date, name, *_ in qld_holidays(2022)}
        self.assertIn(('2022-12-27', 'Christmas Day (additional public holiday)'), holidays_2022)
        holidays_2021 = {(date, name) for date, name, *_ in qld_holidays(2021)}
        self.assertIn(('2021-12-27', 'Christmas Day (additional public holiday)'), holidays_2021)
        self.assertIn(('2021-12-28', 'Boxing Day (additional public holiday)'), holidays_2021)


if __name__ == '__main__':
    unittest.main()
