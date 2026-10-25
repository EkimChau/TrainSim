"""Read docs/stations.xlsx with the standard library only (no openpyxl)."""
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'}


def _col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_workbook(path):
    """Return {sheet_name: [row tuples]} with cell values as strings (or None)."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('m:si', NS):
                shared.append(''.join(t.text or '' for t in si.iter(f'{{{NS["m"]}}}t')))
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        targets = {r.get('Id'): r.get('Target') for r in rels.findall('rel:Relationship', NS)}
        out = {}
        for sheet in wb.find('m:sheets', NS):
            rid = sheet.get(f'{{{NS["r"]}}}id')
            target = targets[rid].lstrip('/')
            target = target if target.startswith('xl/') else 'xl/' + target
            root = ET.fromstring(z.read(target))
            rows = []
            for row in root.iter(f'{{{NS["m"]}}}row'):
                cells = {}
                for c in row.findall('m:c', NS):
                    t = c.get('t')
                    v = c.find('m:v', NS)
                    if t == 's' and v is not None:
                        value = shared[int(v.text)]
                    elif t == 'inlineStr':
                        value = ''.join(x.text or '' for x in c.iter(f'{{{NS["m"]}}}t'))
                    else:
                        value = v.text if v is not None else None
                    cells[_col_index(c.get('r'))] = value
                if cells:
                    width = max(cells) + 1
                    rows.append(tuple(cells.get(i) for i in range(width)))
            out[sheet.get('name')] = rows
        return out


def _records(rows):
    if not rows:
        return []
    header = [str(h or '').strip() for h in rows[0]]
    recs = []
    for row in rows[1:]:
        rec = {header[i]: (str(row[i]).strip() if i < len(row) and row[i] is not None else None)
               for i in range(len(header))}
        if any(rec.values()):
            recs.append(rec)
    return recs


def _yes(value):
    if value is None:
        return None
    return 1 if value.strip().lower() in ('yes', 'y', 'true', '1') else 0


def _rgb_hex(value):
    m = re.match(r'\s*RGB\((\d+),\s*(\d+),\s*(\d+)\)', value or '', re.I)
    return '#%02x%02x%02x' % tuple(int(x) for x in m.groups()) if m else (value or None)


def read_scope(path):
    """Parse the scope workbook into lines, stations, connections and facilities."""
    book = read_workbook(path)
    colours = {r['Line Name']: _rgb_hex(r.get('RGB Color Code')) for r in _records(book.get('line_colors', []))}
    ends = {r['Line Name']: r for r in _records(book.get('line_start_end', []))}
    stations, lines, seq = [], {}, {}
    for r in _records(book.get('stations', [])):
        name, line = r.get('Station Name'), r.get('Train Line')
        if not name:
            continue
        if line and line not in lines:
            lines[line] = {'name': line, 'colour': colours.get(line),
                           'start_station': ends.get(line, {}).get('Start Station'),
                           'end_station': ends.get(line, {}).get('End Station')}
        seq[line] = seq.get(line, 0) + 1
        stations.append({'name': name, 'line': line, 'line_seq': seq[line],
                         'zone': r.get('Zone Number'),
                         'wheelchair': _yes(r.get('Wheelchair Access')),
                         'assisted_wheelchair': _yes(r.get('Assisted Wheelchair Access'))})
    for line, end in ends.items():
        lines.setdefault(line, {'name': line, 'colour': colours.get(line),
                                'start_station': end.get('Start Station'), 'end_station': end.get('End Station')})
    connections = [{'station': r['Common Junction Station'], 'connections': r.get('Connecting Rail / Busway Routes') or ''}
                   for r in _records(book.get('connections', [])) if r.get('Common Junction Station')]
    facilities = [{'name': r['Facility Type'], 'description': r.get('Description')}
                  for r in _records(book.get('facilities', [])) if r.get('Facility Type')]
    return {'lines': list(lines.values()), 'stations': stations,
            'connections': connections, 'facilities': facilities}
