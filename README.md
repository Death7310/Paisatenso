# Paisatenso

Paisatenso is a study app for everyday conversational Spanish in four regional varieties:

| Section | Region | "You" |
|---|---|---|
| 🇨🇴 **Paisa** | Medellín / Antioquia, Colombia | usted (default) · vos |
| 🇦🇷 **Rioplatense** | Buenos Aires / Montevideo | vos · usted |
| 🇭🇳 **Catracho** | Honduras and its diaspora | vos · usted |
| 🇵🇷 **Boricua** | Puerto Rico and its diaspora | tú · usted |

You switch dialects with the flags at the top. Each dialect stores its own progress: spaced-repetition state, scores, test history and streak are saved under separate keys, so practicing one never affects another.

## Sections

- **Learn**: spaced retrieval of high-utility phrases, grouped by theme (greetings, people, fillers, plans, school, military/service, getting around, food, work/money, feelings). Reviews go mostly from English to the dialect, so you practice producing it.
- **Speak**: role-play tasks taken from real situations (school, the Marines, ordering, making plans), scored against native-style models. Also has shadowing: line-by-line listen, repeat, record yourself and compare.
- **Listen**: dialogues with comprehension questions. You hear the audio before you see the transcript. Also has dictation.
- **Read**: short texts with tap-to-gloss words and comprehension questions. The texts include history pieces: Medellín's metro, lunfardo, Lempira, and the 65th Infantry "Borinqueneers".
- **Test**: 10 mixed items, with **production** (you speak or type the dialect) and **reception** (you listen or read) scored separately.
- **Guide**: each dialect's sound, grammar and pragmatic features, plus words to watch out for.
- **Method**: the research behind each activity and the app's limits, with citations.

## Running it

The app has no build step and no dependencies. Do one of the following:

- Open `index.html` in a browser, or
- Serve the folder, e.g. `python3 -m http.server`, then open http://localhost:8000, or
- Enable GitHub Pages on this repo to use it on your phone (Add to Home Screen).

Use Chrome or Edge to get speech recognition (🎤). In other browsers you can type your answers. Text-to-speech uses your device's voices. Install Spanish voices (es-CO, es-AR, es-US, etc.) in your OS settings for better audio. The Home screen tells you which voice is being used for each dialect.

## Android app (APK)

The repo includes an Android wrapper built with [Capacitor](https://capacitorjs.com). In the APK, the app uses Android's native text-to-speech and speech recognition, because the Android WebView doesn't support the browser speech APIs.

**To install:** GitHub Actions builds an APK on every push. On your phone, open the repo's **Releases** page, download `Paisatenso.apk` from the latest release, open it, and allow "Install unknown apps" for your browser when asked. Each new build installs over the previous one and keeps your progress, because every build is signed with the same key, which is committed to the repo.

**For better audio:** go to Android Settings → *Text-to-speech output*, choose *Speech Services by Google*, and install Spanish voice data. Speech recognition needs the Google app to be enabled.

**To build locally** (requires the Android SDK and JDK 21):

```sh
npm ci
npm run android:apk   # → android/app/build/outputs/apk/debug/app-debug.apk
```

The committed signing key is fine for sideloading. Before publishing to Google Play, switch to a private release key that is kept out of git.

## Honest limitations

- Device voices are generic and do not reproduce dialect accents faithfully. Add authentic audio from each region every week.
- Speech recognition is tuned to standard varieties, so treat its scores as rough.
- No app replaces interaction and correction from real speakers, which is the best-supported driver of conversational gains. Use each week's phrases with native-speaker friends and ask them to correct you.
- Slang changes over time and differs by neighborhood. The content follows dialectology references (Lipski 1994; Hualde 2005; ASALE 2010) and common usage, but native speakers have the final word.

## Adding content

Each dialect lives in `js/data/<dialect>.js` and contains `cards`, `readings`, `dialogues`, `tasks` and a `profile`. To add a card, give it a unique `id` and one of the theme ids from `js/core.js`:

```js
{ id: 'ca9', t: 'calle', en: 'English prompt', es: 'Target phrase', alt: ['Other accepted answers'], note: 'Usage note', ex: 'Example sentence', exEn: 'Translation' }
```
