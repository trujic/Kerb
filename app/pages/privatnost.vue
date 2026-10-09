<template>
  <LegalDoc :doc="lang === 'sr' ? sr : en" />
</template>

<script setup lang="ts">
// Draft written against what the code actually does as of 2026-09-23. The
// bracketed controller details must be filled in, and the whole text read by a
// lawyer, before this goes public. When the app starts sending data somewhere
// new, this page changes in the same commit.
import type { Legal } from '~/components/LegalDoc.vue'

const { lang } = useLang()

const CONTROLLER_SR = '[popuni: ime i prezime ili naziv firme, adresa, matični broj]'
const CONTROLLER_EN = '[fill in: name or company, address, registration number]'
const CONTACT = '[popuni: kontakt@kerb.rs]'

const sr: Legal = {
  title: 'Politika privatnosti',
  updated: 'Poslednja izmena: 23. septembar 2026.',
  intro:
    'Kerb je vodič za ulično parkiranje. Trudimo se da znamo što manje o tebi: većina podataka ostaje na tvom telefonu, a plaćanje ide sa tvog telefona direktno operateru parkinga.',
  sections: [
    {
      h: 'Ko obrađuje podatke',
      p: [`Rukovalac podacima: ${CONTROLLER_SR}. Kontakt za pitanja o privatnosti: ${CONTACT}.`],
    },
    {
      h: 'Šta ostaje samo na tvom uređaju',
      p: ['Bez naloga, sledeće se čuva samo u pregledaču na tvom telefonu i ne šalje se nama:'],
      list: [
        'tablica koju upišeš (da bi SMS bio spreman);',
        'parkiranja koja pokreneš i podsetnici za istek;',
        'podešavanja, na primer jezik (kolačić kerb_lang).',
      ],
    },
    {
      h: 'Lokacija',
      p: [
        'Lokaciju koristimo samo uz tvoju dozvolu u pregledaču, da bismo našli zonu u kojoj si. Zona se računa na tvom uređaju. Da bismo prikazali ime ulice i grada, tvoj pregledač šalje koordinate servisu OpenStreetMap Nominatim, a mapa se učitava sa servera OpenStreetMap (tiles.openstreetmap.rs i tile.openstreetmap.org). Mi tvoju lokaciju ne čuvamo, osim uz skeniranu tablu i uz parkiranje koje pokreneš dok si prijavljen (vidi ispod).',
      ],
    },
    {
      h: 'Plaćanje parkinga',
      p: [
        'Kerb ne prima tvoj novac i ne vidi tvoju poruku. Kad prevučeš klizač, tvoj telefon otvara SMS ka broju operatera parkinga, a ti ga šalješ. Cenu naplaćuje tvoj mobilni operater po uslovima operatera parkinga.',
      ],
    },
    {
      h: 'Skeniranje table',
      p: [
        'Kad skeniraš tablu, fotografija se šalje servisu Anthropic (Claude) da bi se pročitao tekst sa table. Ako potvrdiš skeniranje, čuvamo fotografiju, pročitani tekst, zonu, lokaciju i pravac telefona u trenutku slikanja. Ta fotografija i lokacija se javno prikazuju na mapi kao dokaz šta piše na tabli. Slikaj samo tablu, bez ljudi i tuđih tablica.',
      ],
    },
    {
      h: 'Ako napraviš nalog',
      p: ['Uz nalog čuvamo:'],
      list: [
        'e-adresu, lozinku (šifrovanu, kod servisa Supabase) i ime koje upišeš;',
        'tablice koje sačuvaš, da bi radile na svakom uređaju;',
        'parkiranja koja pokreneš dok si prijavljen: zonu, ulicu, lokaciju, tablicu i vreme;',
        'pretplatu za obaveštenja, ako ih uključiš.',
      ],
    },
    {
      h: 'Merenje posete',
      p: [
        'Brojimo samo zbirne dnevne brojke, na primer koliko puta je prikazana zona, otvoren SMS ili skenirana tabla, po gradu. Ti brojevi se čuvaju kod nas (Supabase) i u njima nema tvoje tablice, lokacije, ulice ni IP adrese; IP adresa se koristi samo trenutno, da bi se sprečilo zloupotrebljavanje brojača, i ne čuva se. Ako je uključeno, iste zbirne brojke šaljemo i alatu Plausible, koji ne koristi kolačiće i ne prati pojedince.',
      ],
    },
    {
      h: 'Kome se podaci šalju',
      p: [
        'Koristimo spoljne servise: Netlify (hosting), Supabase (baza i nalozi), Anthropic (čitanje table), OpenStreetMap (mapa i adrese) i Plausible (merenje posete). Neki od njih obrađuju podatke van Srbije. Podatke ne prodajemo i ne delimo radi reklama.',
      ],
    },
    {
      h: 'Koliko dugo',
      p: [
        'Podaci na uređaju ostaju dok ih ne obrišeš (brisanjem podataka sajta). Podaci naloga ostaju dok nalog postoji; na zahtev brišemo nalog sa svim podacima. Skenirane table čuvamo dok služe kao dokaz šta na tabli piše.',
      ],
    },
    {
      h: 'Tvoja prava',
      p: [
        `Po Zakonu o zaštiti podataka o ličnosti imaš pravo da tražiš uvid, ispravku ili brisanje podataka, ograničenje obrade i prenos podataka, i da povučeš saglasnost. Piši nam na ${CONTACT}. Imaš i pravo na pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti.`,
      ],
    },
  ],
}

const en: Legal = {
  title: 'Privacy policy',
  updated: 'Last updated: 23 September 2026.',
  intro:
    'Kerb is a street-parking guide. We try to know as little about you as possible: most data stays on your phone, and payment goes from your phone straight to the parking operator.',
  sections: [
    { h: 'Who processes the data', p: [`Controller: ${CONTROLLER_EN}. Privacy contact: ${CONTACT}.`] },
    {
      h: 'What stays on your device',
      p: ['Without an account, the following is kept only in the browser on your phone and is never sent to us:'],
      list: ['the plate you type (so the SMS is ready);', 'parking sessions you start and their reminders;', 'settings such as language (cookie kerb_lang).'],
    },
    {
      h: 'Location',
      p: ['We use your location only with your browser’s permission, to find the zone you are in. The zone is worked out on your device. To show the street and city name, your browser sends the coordinates to OpenStreetMap Nominatim, and map tiles load from OpenStreetMap servers. We do not store your location, except with a scanned sign and with parking you start while signed in (see below).'],
    },
    {
      h: 'Paying for parking',
      p: ['Kerb does not take your money and does not see your message. When you slide, your phone opens an SMS to the parking operator’s number and you send it. Your mobile operator charges it on the parking operator’s terms.'],
    },
    {
      h: 'Scanning a sign',
      p: ['When you scan a sign, the photo is sent to Anthropic (Claude) to read the text on it. If you confirm the scan, we keep the photo, the text read, the zone, and where the phone was and which way it pointed. The photo and location are shown publicly on the map as evidence of what the sign says. Photograph only the sign, without people or other cars’ plates.'],
    },
    {
      h: 'If you create an account',
      p: ['With an account we keep:'],
      list: ['your email, password (hashed, at Supabase) and the name you enter;', 'plates you save, so they work on every device;', 'parking you start while signed in: zone, street, location, plate and time;', 'your notification subscription, if you turn it on.'],
    },
    {
      h: 'Measuring visits',
      p: ['We count only daily totals, such as how often a zone was shown, an SMS opened or a sign scanned, per city. Those totals are kept by us (Supabase) and hold no plate, location, street or IP address; the IP address is used only in the moment, to stop the counter being abused, and is not stored. When enabled, the same totals also go to Plausible, which uses no cookies and does not track individuals.'],
    },
    {
      h: 'Who receives data',
      p: ['We use outside services: Netlify (hosting), Supabase (database and accounts), Anthropic (reading signs), OpenStreetMap (maps and addresses) and Plausible (visit counts). Some process data outside Serbia. We do not sell data or share it for advertising.'],
    },
    {
      h: 'How long',
      p: ['Data on your device stays until you clear it (by clearing the site’s data). Account data stays while the account exists; on request we delete the account and everything in it. Scanned signs are kept while they serve as evidence of what the sign says.'],
    },
    {
      h: 'Your rights',
      p: [`Under Serbia’s Law on Personal Data Protection you can ask to access, correct or delete your data, restrict processing, port it, and withdraw consent. Write to ${CONTACT}. You may also complain to the Commissioner for Information of Public Importance and Personal Data Protection.`],
    },
  ],
}

useSeoMeta({
  title: () => (lang.value === 'sr' ? 'Politika privatnosti · Kerb' : 'Privacy policy · Kerb'),
  robots: 'index, follow',
})
</script>
