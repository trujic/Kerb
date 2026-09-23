<template>
  <LegalDoc :doc="lang === 'sr' ? sr : en" />
</template>

<script setup lang="ts">
// Draft — the bracketed details must be filled in and the text reviewed by a
// lawyer before launch. The core promise is deliberately narrow: Kerb informs,
// the sign rules, the driver pays. Nothing here may promise more than the app does.
import type { Legal } from '~/components/LegalDoc.vue'

const { lang } = useLang()

const OPERATOR_SR = '[popuni: ime i prezime ili naziv firme, adresa]'
const OPERATOR_EN = '[fill in: name or company, address]'
const CONTACT = '[popuni: kontakt@kerb.rs]'

const sr: Legal = {
  title: 'Uslovi korišćenja',
  updated: 'Poslednja izmena: 23. septembar 2026.',
  intro: `Kerb (kerb.rs) vodi ${OPERATOR_SR}. Korišćenjem Kerba prihvataš ove uslove.`,
  sections: [
    {
      h: 'Šta je Kerb',
      p: [
        'Kerb je besplatan informativni vodič za ulično parkiranje. Kerb nije operater parkinga, ne naplaćuje parking i ne izdaje karte. Podatke o zonama, cenama i pravilima preuzimamo iz zvaničnih izvora operatera i uz svaki navodimo izvor i datum provere.',
      ],
    },
    {
      h: 'Tabla je zvanična',
      p: [
        'Pravila koja važe na nekom mestu su ona na tabli i oznakama na tom mestu. Ako se Kerb i tabla ne slažu, važi tabla. Lokacija telefona može da greši desetinama metara, a operater može da promeni zonu pre nego što mi to saznamo. Zato Kerb na granici zona ne bira umesto tebe.',
      ],
    },
    {
      h: 'Tvoja odgovornost',
      p: [
        'Ti biraš zonu i šalješ SMS sa svog telefona. Odgovoran si da proveriš tablu, tablicu u poruci i da je poruka poslata i potvrđena odgovorom operatera. Odgovor operatera je tvoja karta; Kerbov prikaz parkiranja je samo podsetnik.',
      ],
    },
    {
      h: 'Ograničenje odgovornosti',
      p: [
        'Kerb se pruža „kakav jeste“. U meri u kojoj zakon dozvoljava, ne odgovaramo za doplatne karte, kazne, troškove pauka ili drugu štetu nastalu zbog oslanjanja na prikazane podatke, za kvar mreže ili telefona, niti za rad usluga operatera parkinga i mobilnih operatera.',
      ],
    },
    {
      h: 'Tvoj doprinos',
      p: [
        'Kad skeniraš tablu ili pošalješ ispravku, dozvoljavaš Kerbu da taj sadržaj (fotografiju, tekst i lokaciju) koristi i javno prikaže, bez naknade, da bi podaci bili tačni. Šalji samo ono što si sam snimio i što ne otkriva tuđe lične podatke.',
      ],
    },
    {
      h: 'Šta nije dozvoljeno',
      list: [
        'slanje lažnih ili tuđih fotografija table i namerno pogrešnih ispravki;',
        'automatsko preuzimanje podataka u velikom obimu i opterećivanje servisa;',
        'korišćenje Kerba za bilo šta protivno zakonu.',
      ],
      p: [],
    },
    {
      h: 'Izmene',
      p: [
        'Kerb i ove uslove možemo da menjamo. Datum poslednje izmene je na vrhu. Na ove uslove primenjuje se pravo Republike Srbije.',
        `Pitanja i prijave grešaka: ${CONTACT}.`,
      ],
    },
  ],
}

const en: Legal = {
  title: 'Terms of use',
  updated: 'Last updated: 23 September 2026.',
  intro: `Kerb (kerb.rs) is run by ${OPERATOR_EN}. By using Kerb you accept these terms.`,
  sections: [
    { h: 'What Kerb is', p: ['Kerb is a free information guide to street parking. Kerb is not a parking operator, does not charge for parking and does not issue tickets. Zone, price and rule data come from the operator’s official sources, each shown with its source and the date we checked it.'] },
    { h: 'The sign is official', p: ['The rules that apply at a spot are the ones on the sign and markings there. If Kerb and the sign disagree, the sign wins. Phone location can be tens of metres off, and an operator can change a zone before we learn of it. That is why Kerb does not choose for you at a zone boundary.'] },
    { h: 'Your responsibility', p: ['You choose the zone and send the SMS from your phone. You are responsible for checking the sign, the plate in the message, and that the message was sent and confirmed by the operator’s reply. That reply is your ticket; Kerb’s parking display is only a reminder.'] },
    { h: 'Limitation of liability', p: ['Kerb is provided “as is”. To the extent the law allows, we are not liable for surcharge tickets, fines, towing costs or other loss from relying on the data shown, for network or phone failures, or for the services of parking and mobile operators.'] },
    { h: 'Your contributions', p: ['When you scan a sign or send a correction, you allow Kerb to use and publicly show that content (photo, text and location), without payment, to keep the data accurate. Send only what you took yourself and what does not reveal other people’s personal data.'] },
    { h: 'Not allowed', p: [], list: ['false or copied sign photos and deliberately wrong corrections;', 'bulk automated collection of data or overloading the service;', 'using Kerb for anything unlawful.'] },
    { h: 'Changes', p: ['We may change Kerb and these terms. The date of the last change is at the top. These terms are governed by the law of the Republic of Serbia.', `Questions and error reports: ${CONTACT}.`] },
  ],
}

useSeoMeta({
  title: () => (lang.value === 'sr' ? 'Uslovi korišćenja · Kerb' : 'Terms of use · Kerb'),
})
</script>
