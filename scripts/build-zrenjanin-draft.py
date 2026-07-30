import json, math, re, unicodedata, collections
osm=json.load(open('osm-zr.json'))['elements']
park=json.load(open('osm-zrp.json'))['elements']

CYR={'а':'a','б':'b','в':'v','г':'g','д':'d','ђ':'dj','е':'e','ж':'z','з':'z','и':'i','ј':'j','к':'k','л':'l','љ':'lj','м':'m','н':'n','њ':'nj','о':'o','п':'p','р':'r','с':'s','т':'t','ћ':'c','у':'u','ф':'f','х':'h','ц':'c','ч':'c','џ':'dz','ш':'s'}
def norm(s):
    s=s.lower(); s=''.join(CYR.get(c,c) for c in s)
    s=s.replace('đ','dj').replace('ć','c').replace('č','c').replace('š','s').replace('ž','z')
    s=''.join(c for c in unicodedata.normalize('NFD',s) if unicodedata.category(c)!='Mn')
    s=re.sub(r'^(bulevar|bul\.?|ulica|ul\.?|trg|kej|obala)\s+','',s)
    return ' '.join(s.replace('.','').replace(',','').split())

ways=collections.defaultdict(list)
for e in osm:
    n=e.get('tags',{}).get('name')
    if n and e.get('geometry'): ways[norm(n)].append([(g['lon'],g['lat']) for g in e['geometry']])

# eksplicitna preslikavanja gde se zvanični naziv i OSM razlikuju
ALIAS={'kralja petra i':'kralja petra prvog','2 oktobra':'drugog oktobra',
       'dr jovana cvijica':'jovana cvijica','20 oktobra':'20 oktobra'}
def get(name):
    k=norm(name); k=ALIAS.get(k,k)
    if k in ways: return ways[k]
    for kk,v in ways.items():
        if k and (k in kk or kk in k): return v
    return None

M=110540
def mlng(lat): return 111320*math.cos(math.radians(lat))
def d_m(a,b):
    return math.hypot((a[0]-b[0])*mlng(a[1]), (a[1]-b[1])*M)

def clip(lines, a_name, b_name):
    """Zadrži deo ulice između dve poprečne ulice."""
    A=get(a_name); B=get(b_name)
    if not A or not B: return lines, False
    Ap=[p for l in A for p in l]; Bp=[p for l in B for p in l]
    out=[]
    for line in lines:
        ia=min(range(len(line)), key=lambda i: min(d_m(line[i],q) for q in Ap))
        ib=min(range(len(line)), key=lambda i: min(d_m(line[i],q) for q in Bp))
        lo,hi=sorted((ia,ib))
        if hi-lo>=1: out.append(line[lo:hi+1])
    return (out or lines), bool(out)

ZONES={'Zone I — Red':'#E25141','Zone II — Yellow':'#D97706','Zone III — Green':'#16A34A'}
SPEC=[
  ('Zone I — Red',   'Pupinova',None,None), ('Zone I — Red','Svetosavska',None,None),
  ('Zone I — Red',   'Jevrejska',None,None), ('Zone I — Red','Gimnazijska',None,None),
  ('Zone I — Red',   'Kralja Aleksandra I Karađorđevića',None,None),
  ('Zone I — Red',   'Kralja Petra I',None,None), ('Zone I — Red','Sarajlijina',None,None),
  ('Zone I — Red',   'Nemanjina',None,None), ('Zone I — Red','dr Slavka Županskog',None,None),
  ('Zone II — Yellow','Slobodana Bursaća',None,None), ('Zone II — Yellow','Saveznička',None,None),
  ('Zone II — Yellow','Gundulićeva',None,None),
  ('Zone II — Yellow','Cara Dušana','Slobodana Bursaća','Bulevar Milutina Milankovića'),
  ('Zone II — Yellow','Vuka Karadžića',None,None),
  ('Zone II — Yellow','Kej 2. Oktobra',None,None),
  ('Zone II — Yellow','Obala Sonje Marinković',None,None), ('Zone II — Yellow','Obilićeva',None,None),
  ('Zone II — Yellow','Petefijeva',None,None),
  ('Zone II — Yellow','Ive Lole Ribara','Bulevar Milutina Milankovića','Petefijeva'),
  ('Zone III — Green','Daničićeva',None,None), ('Zone III — Green','Marka Oreškovića',None,None),
  ('Zone III — Green','Ive Lole Ribara','Orlova','Dr Jovana Cvijića'),
  ('Zone III — Green','20. oktobra',None,None), ('Zone III — Green','Save Tekelije',None,None),
  ('Zone III — Green','Dr Laze Kostića',None,None), ('Zone III — Green','Milentija Popovića',None,None),
]
LOTS={  # ime u cenovniku -> (OSM ime, zona)
  'Паркинг код старе пијаце':'Zone II — Yellow',
  'Пијаца Багљаш':'Zone III — Green',
  'Пијаца Југ Богдана':'Zone III — Green',
}

feats=[]; rep=[]
for zone,name,a,b in SPEC:
    lines=get(name)
    if not lines: rep.append(('✗ nema u OSM-u', zone, name)); continue
    clipped=False
    if a and b:
        lines, clipped = clip(lines, a, b)
    for ln in lines:
        if len(ln)<2: continue
        feats.append({'type':'Feature','properties':{
            'name':name,'zone':zone,'color':ZONES[zone],
            **({'segment':f'{a} → {b}'} if a else {}),
            'source':'osm-centerline'},
            'geometry':{'type':'LineString','coordinates':[[round(x,6),round(y,6)] for x,y in ln]}})
    rep.append((('~ odsečak' if clipped else '✓ cela ulica'), zone, name))

for e in park:
    n=e.get('tags',{}).get('name')
    if n in LOTS and e.get('geometry'):
        ring=[[round(g['lon'],6),round(g['lat'],6)] for g in e['geometry']]
        if ring[0]!=ring[-1]: ring.append(ring[0])
        if len(ring)>=4:
            feats.append({'type':'Feature','properties':{
                'name':n,'zone':LOTS[n],'color':ZONES[LOTS[n]],'source':'osm-parking'},
                'geometry':{'type':'Polygon','coordinates':[ring]}})
            rep.append(('✓ parkiralište iz OSM-a', LOTS[n], n))

fc={'type':'FeatureCollection','features':feats}
json.dump(fc, open('zrenjanin-draft.json','w'), ensure_ascii=False)
print(f'=== NACRT: {len(feats)} delova ===\n')
per=collections.Counter(f['properties']['zone'] for f in feats)
for z,n in per.items(): print(f'  {z:<20} {n}')
print()
for st,z,n in rep: print(f'  {st:<24} {z:<20} {n}')
