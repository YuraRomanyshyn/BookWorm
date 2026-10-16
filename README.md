# BOOK WORM – półka z książkami

Appka webowa (PWA) na iPhone'a. Wyszukujesz książkę po tytule, autorze albo kodzie kreskowym ISBN i odkładasz ją na swoją półkę.

## Co potrafi

- **Moja półka** z trzema zakładkami: Czytam, Do przeczytania, Przeczytane.
- **Przeczytane według roku.** Data przeczytania zapisuje się sama, a w szczegółach książki możesz ją zmienić. Appka liczy też książki i strony w wybranym roku.
- **Notatka** przy każdej książce z półki. Linki z notatki pokazują się jako przyciski do stuknięcia.
- **Szukaj w Empik i Empik Go**: przycisk otwiera wyszukiwanie danej książki.
- **Skaner ISBN**: aparat na żywo, zdjęcie kodu albo ręczne wpisanie numeru.
- Kciuki 👍 / 👎 przy przeczytanych, usuwanie przesunięciem w lewo, kopia zapasowa.

Dane o książkach pochodzą z Google Books i Open Library. **Nie potrzebujesz żadnego klucza.**

## Publikacja na GitHub Pages

1. Na github.com kliknij **New** (nowe repozytorium). Nazwa: `BookWorm`, ustaw **Public** i kliknij **Create repository**.
2. Kliknij **uploading an existing file**. Przeciągnij **całą zawartość** rozpakowanego folderu `bookworm`, razem z folderem `icons`. Kliknij **Commit changes**.
3. Upewnij się, że na liście plików widać folder `icons` i plik `scanner.js`.
4. Wejdź w **Settings → Pages**, wybierz **Deploy from a branch**, gałąź **main**, folder **/ (root)** i kliknij **Save**.
5. Po 1–2 minutach appka będzie pod adresem `https://yuraromanyshyn.github.io/BookWorm/`.

## Instalacja na iPhonie

1. Otwórz adres w **Safari**.
2. Stuknij **Udostępnij** i wybierz **Dodaj do ekranu początkowego**.
3. Uruchom appkę z ikony. Przy pierwszym skanowaniu iPhone zapyta o dostęp do aparatu, wybierz **Pozwól**.

## Skaner: wskazówki

- Trzymaj kod **poziomo**, w ramce, z odległości ok. 10–15 cm, w dobrym świetle.
- Gdy aparat nie łapie kodu: **Zrób zdjęcie kodu** (z bliska, ostre, bez odblasków) albo **wpisz ISBN** ręcznie.
- Polskie książki nie zawsze są w Google Books. Wtedy appka szuka w Open Library, a jeśli nic nie znajdzie, wpisz tytuł.

---
Dane o książkach: Google Books i Open Library (Internet Archive).
