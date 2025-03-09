const express = require('express');
const mysql = require('mysql2');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const app = express();

// Ustawienia EJS
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Konfiguracja bazy danych
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',  // Zamień na swoje dane
    password: '',  // Hasło do bazy
    database: 'szkoly'
});

// Połączenie z bazą danych
db.connect((err) => {
    if (err) {
        console.error('Błąd połączenia z bazą danych:', err);
        return;
    }
    console.log('Połączono z bazą danych MySQL');
});

// Funkcja do pobierania statusu witryny z pliku settings.json
function getSiteStatus() {
    const settingsPath = path.join(__dirname, 'settings.json');
    if (fs.existsSync(settingsPath)) {
        const settingsData = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return settingsData.siteStatus;
    }
    return 'active'; // Domyślny status, jeśli plik nie istnieje
}

// Konfiguracja sesji
app.use(session({
    secret: 'W@sz@Sz0ł@2025',
    resave: false,
    saveUninitialized: true
}));

// Funkcja do zaktualizowania liczby odwiedzin
function updateVisits(page) {
    fs.readFile('visits.json', (err, data) => {
        let visitsData;
        
        if (err) {
            // Jeżeli plik nie istnieje, tworzymy go z domyślnymi wartościami
            visitsData = {
                visits: 1,
                pages: {
                    "/": 0,
                    "/search": 0,
                    "/about": 0,
                    "/join-now": 0
                }
            };
        } else {
            visitsData = JSON.parse(data);
            visitsData.visits += 1;  // Zwiększamy liczbę ogólnych odwiedzin

            // Zwiększamy liczbę odwiedzin dla danej podstrony
            if (visitsData.pages[page] !== undefined) {
                visitsData.pages[page] += 1;
            } else {
                // Jeżeli podstrona nie istnieje, dodajemy ją z liczbą odwiedzin = 1
                visitsData.pages[page] = 1;
            }
        }

        // Zapisujemy zaktualizowane dane
        fs.writeFileSync('visits.json', JSON.stringify(visitsData, null, 2));
    });
}

app.get('/', (req, res) => {
    // Sprawdzenie statusu witryny
    const siteStatus = getSiteStatus();

    // Jeśli strona jest w trybie aktualizacji, przerwy technicznej lub wyłączona, wyświetl odpowiedni komunikat
    if (siteStatus === 'update') {
        return res.render('maintenance', { message: 'Strona jest aktualnie w trakcie aktualizacji. Proszę spróbować później.' });
    } else if (siteStatus === 'maintenance') {
        return res.render('maintenance', { message: 'Strona jest obecnie w przerwie technicznej. Proszę spróbować później.' });
    } else if (siteStatus === 'inactive') {
        return res.render('maintenance', { message: 'Strona została wyłączona. Proszę spróbować później.' });
    }

    // Zaktualizuj liczbę odwiedzin
    updateVisits("/");

    // Odczytanie liczb odwiedzin
    fs.readFile('visits.json', (err, data) => {
        if (err) {
            res.render('index', { liczbaSzkół: 0, liczbaMiast: 0, liczbaOdwiedzin: 0, miasta: [] });
        } else {
            let visits = JSON.parse(data).visits;
            
            // Zapytanie do bazy danych, aby uzyskać liczbę unikalnych szkół i miast
            db.query('SELECT COUNT(DISTINCT nazwa) AS liczbaSzkół FROM szkoły', (err, schoolResults) => {
                if (err) {
                    console.error('Błąd zapytania o liczbę szkół:', err);
                    return res.status(500).send('Błąd bazy danych');
                }

                db.query('SELECT COUNT(DISTINCT miasto) AS liczbaMiast FROM szkoły', (err, cityResults) => {
                    if (err) {
                        console.error('Błąd zapytania o liczbę miast:', err);
                        return res.status(500).send('Błąd bazy danych');
                    }

                        // Wysyłamy dane do widoku
                        res.render('index', {
                            liczbaSzkół: schoolResults[0].liczbaSzkół,
                            liczbaMiast: cityResults[0].liczbaMiast,
                            liczbaOdwiedzin: visits
                        });
                });
            });
        }
    });
});

app.post('/search', (req, res) => {
    // Sprawdzenie statusu witryny
    const siteStatus = getSiteStatus();

    // Jeśli strona jest w trybie aktualizacji, przerwy technicznej lub wyłączona, wyświetl odpowiedni komunikat
    if (siteStatus === 'update') {
        return res.render('maintenance', { message: 'Strona jest aktualnie w trakcie aktualizacji. Proszę spróbować później.' });
    } else if (siteStatus === 'maintenance') {
        return res.render('maintenance', { message: 'Strona jest obecnie w przerwie technicznej. Proszę spróbować później.' });
    } else if (siteStatus === 'inactive') {
        return res.render('maintenance', { message: 'Strona została wyłączona. Proszę spróbować później.' });
    }

    const { miasto, typ } = req.body;

    let query = 'SELECT * FROM szkoły WHERE 1=1';

    if (miasto) {
        query += ` AND miasto LIKE '%${miasto}%'`; // Filtrujemy po nazwie miasta
    }

    if (typ) {
        query += ` AND typ = '${typ}'`; // Filtrujemy po typie szkoły
    }

    // Zaktualizuj liczbę odwiedzin
    updateVisits("/search");

    db.query(query, (err, results) => {
        if (err) {
            console.error('Błąd zapytania:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        // Zbieramy dane o miastach
        let miastaQuery = 'SELECT miasto, COUNT(*) AS liczba_szkół FROM szkoły GROUP BY miasto';
        db.query(miastaQuery, (err, miastaResults) => {
            if (err) {
                console.error('Błąd zapytania o miasta:', err);
                return res.status(500).send('Błąd bazy danych');
            }

            // Wysyłamy dane do widoku
            res.render('results', { szkoly: results, miastatotal: miastaResults });
        });
    });
});

app.get('/zgloszenie/:id', (req, res) => {
    // Sprawdzenie statusu witryny
    const siteStatus = getSiteStatus();

    // Jeśli strona jest w trybie aktualizacji, przerwy technicznej lub wyłączona, wyświetl odpowiedni komunikat
    if (siteStatus === 'update') {
        return res.render('maintenance', { message: 'Strona jest aktualnie w trakcie aktualizacji. Proszę spróbować później.' });
    } else if (siteStatus === 'maintenance') {
        return res.render('maintenance', { message: 'Strona jest obecnie w przerwie technicznej. Proszę spróbować później.' });
    } else if (siteStatus === 'inactive') {
        return res.render('maintenance', { message: 'Strona została wyłączona. Proszę spróbować później.' });
    }

    const szkolaId = req.params.id;

    // Możesz pobrać dane szkoły z bazy danych, aby je wyświetlić w formularzu zgłoszeniowym
    db.query('SELECT * FROM szkoły WHERE id = ?', [szkolaId], (err, results) => {
        if (err) {
            return res.status(500).send('Błąd bazy danych');
        }

        const szkola = results[0]; // Pobieramy dane szkoły
        res.render('zgloszenie', { szkola });
    });
});

app.post('/wyslij/zgloszenie/:id', (req, res) => {
    const szkolaId = req.params.id;
    const opis = req.body.opis;

    // Zapisz zgłoszenie do bazy danych lub wyślij na e-mail
    db.query('INSERT INTO zgloszenia (szkola_id, opis) VALUES (?, ?)', [szkolaId, opis], (err, result) => {
        if (err) {
            return res.status(500).send('Błąd zapisu zgłoszenia');
        }
        res.send('Zgłoszenie zostało wysłane!');
    });
});

// Trasa na stronę przerwy technicznej (maintenance)
app.get('/maintenance', (req, res) => {
    const siteStatus = getSiteStatus();
    if (siteStatus === 'update' || siteStatus === 'maintenance' || siteStatus === 'inactive') {
        return res.render('maintenance', { message: 'Strona jest obecnie w przerwie technicznej lub wyłączona. Proszę spróbować później.' });
    }
    res.redirect('/');
});

// Strona logowania
app.get('/login', (req, res) => {
    res.render('login');
});

// Strona logowania
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
        if (err) {
            console.error('Błąd logowania:', err);
            return res.status(500).send('Błąd logowania');
        }

        if (results.length > 0) {
            const user = results[0];
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                req.session.user = user; // Zapisanie danych użytkownika w sesji
                if (user.is_admin) {
                    res.redirect('/admin');  // Jeśli to administrator, przekierowujemy do panelu
                } else {
                    res.redirect('/dashboard'); // Zwykły użytkownik
                }
            } else {
                res.send('Nieprawidłowe dane logowania');
            }
        } else {
            res.send('Nieprawidłowe dane logowania');
        }
    });
});

app.get('/admin', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    // Zapytanie do bazy danych o liczbę szkół
    db.query('SELECT COUNT(DISTINCT nazwa) AS liczbaSzkół FROM szkoły', (err, schoolResults) => {
        if (err) {
            console.error('Błąd zapytania o liczbę szkół:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        // Zapytanie do bazy danych o liczbę miast
        db.query('SELECT COUNT(DISTINCT miasto) AS liczbaMiast FROM szkoły', (err, cityResults) => {
            if (err) {
                console.error('Błąd zapytania o liczbę miast:', err);
                return res.status(500).send('Błąd bazy danych');
            }

            // Odczytanie liczby odwiedzin
            fs.readFile('visits.json', (err, data) => {
                let visits = 0;
                if (!err) {
                    visits = JSON.parse(data).visits;
                }

                // Renderowanie widoku z danymi statystyk
                res.render('admin/dashboard', {
                    user: req.session.user,  // Załóżmy, że dane użytkownika są przechowywane w sesji
                    liczbaSzkół: schoolResults[0].liczbaSzkół,
                    liczbaMiast: cityResults[0].liczbaMiast,
                    liczbaOdwiedzin: visits
                });
            });
        });
    });
});

// Route to show the list of schools and complaints
app.get('/admin/schools', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    // Zapytanie do bazy danych, aby pobrać wszystkie szkoły
    db.query('SELECT * FROM szkoły', (err, schools) => {
        if (err) {
            console.error('Błąd zapytania do bazy danych:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        // Zapytanie do bazy danych, aby pobrać zgłoszenia
        db.query('SELECT zgloszenia.id, zgloszenia.opis, zgloszenia.data_zgloszenia, szkoły.nazwa AS nazwa_szkola FROM zgloszenia JOIN szkoły ON zgloszenia.szkola_id = szkoły.id', (err, complaints) => {
            if (err) {
                console.error('Błąd zapytania do bazy danych:', err);
                return res.status(500).send('Błąd bazy danych');
            }

            // Wysłanie danych do widoku
            res.render('admin/schools', { schools: schools, zgłoszenia: complaints });
        });
    });
});

app.get('/admin/settings', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    // Odczytanie statusu witryny z pliku
    const siteStatus = getSiteStatus(); // Funkcja zwraca status witryny

    // Renderowanie strony ustawień z aktualnym statusem witryny
    res.render('admin/settings', { user: req.session.user, siteStatus: siteStatus });
});

// Trasa do zapisania ustawień witryny
app.post('/admin/settings/update', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    const { siteStatus } = req.body;

    // Zapisanie statusu witryny do pliku settings.json
    const settingsPath = path.join(__dirname, 'settings.json');
    const settingsData = { siteStatus: siteStatus };

    // Zapisanie danych do pliku
    fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2));

    // Po zapisaniu statusu, przekierowanie z powrotem do strony ustawień
    res.redirect('/admin/settings');
});

// Wyświetlanie formularza dodawania szkoły
app.get('/admin/add', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }
    res.render('admin/add', { user: req.user, school: null }); // Renderujemy formularz bez danych szkoły
});

// Wyświetlanie formularza edytowania szkoły
app.get('/admin/edit/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    const schoolId = req.params.id;

    // Zapytanie do bazy danych, aby pobrać dane szkoły
    const query = 'SELECT * FROM szkoły WHERE id = ?';
    db.query(query, [schoolId], (err, result) => {
        if (err) {
            console.error('Błąd zapytania:', err);
            return res.status(500).send('Błąd bazy danych');
        }
        if (result.length === 0) {
            return res.status(404).send('Szkoła nie znaleziona');
        }

        // Renderowanie formularza z danymi szkoły
        res.render('admin/edit', { user: req.user, school: result[0] });
    });
});

// Dodawanie nowej szkoły do bazy danych
app.post('/admin/add', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    // Pobieranie danych z formularza
    const { nazwa, miasto, typ, szerokosc, dlugosc, adres, telefon, opis, sklepik_szkola, przewozy_szkola, pomoc_niepelnosprawnych } = req.body;

    // Walidacja danych
    if (!nazwa || !miasto || !typ || !szerokosc || !dlugosc || !adres || !telefon || !opis) {
        return res.status(400).send('Wszystkie pola są wymagane');
    }

    // Zapytanie do bazy danych, aby dodać nową szkołę
    const query = 'INSERT INTO szkoły (nazwa, miasto, typ, szerokosc, dlugosc, adres, telefon, opis, sklepik_szkola, przewozy_szkola, pomoc_niepelnosprawnych) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [nazwa, miasto, typ, szerokosc, dlugosc, adres, telefon, opis, sklepik_szkola, przewozy_szkola, pomoc_niepelnosprawnych], (err, result) => {
        if (err) {
            console.error('Błąd zapytania:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        // Po dodaniu szkoły przekierowanie na stronę z listą szkół
        res.redirect('/admin/schools');
    });
});

// Edytowanie istniejącej szkoły w bazie danych
app.post('/admin/edit/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    const schoolId = req.params.id;
    const { nazwa, miasto, typ, szerokosc, dlugosc, adres, telefon, opis, sklepik_szkola, przewozy_szkola, pomoc_niepelnosprawnych } = req.body;

    // Walidacja danych
    if (!nazwa || !miasto || !typ || !szerokosc || !dlugosc || !adres || !telefon || !opis) {
        return res.status(400).send('Wszystkie pola są wymagane');
    }

    // Zapytanie do bazy danych, aby zaktualizować dane szkoły
    const query = 'UPDATE szkoły SET nazwa = ?, miasto = ?, typ = ?, szerokosc = ?, dlugosc = ?, adres = ?, telefon = ?, opis = ?, sklepik_szkola = ?, przewozy_szkola = ?, pomoc_niepelnosprawnych = ? WHERE id = ?';
    db.query(query, [nazwa, miasto, typ, szerokosc, dlugosc, adres, telefon, opis, sklepik_szkola, przewozy_szkola, pomoc_niepelnosprawnych, schoolId], (err, result) => {
        if (err) {
            console.error('Błąd zapytania:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        // Po edycji szkoły przekierowanie na stronę z listą szkół
        res.redirect('/admin/schools');
    });
});

// Trasa do usuwania szkoły
app.get('/admin/delete/:id', (req, res) => {
    const schoolId = req.params.id;

    // Zapytanie do usunięcia szkoły o danym ID
    const deleteQuery = 'DELETE FROM szkoły WHERE id = ?';
    
    db.query(deleteQuery, [schoolId], (err, result) => {
        if (err) {
            console.error('Błąd przy usuwaniu szkoły:', err);
            return res.status(500).send('Błąd serwera.');
        }

        if (result.affectedRows > 0) {
            res.send(`Szkoła o ID ${schoolId} została usunięta.`);
        } else {
            res.status(404).send('Szkoła nie została znaleziona.');
        }
    });
});

// Route to view details of a specific zgłoszenie (report)
app.get('/admin/zgloszenie/:id/views', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    const zgloszenieId = req.params.id;

    // Zapytanie do bazy danych, aby pobrać szczegóły zgłoszenia na podstawie id
    db.query('SELECT * FROM zgloszenia WHERE id = ?', [zgloszenieId], (err, results) => {
        if (err) {
            console.error('Błąd zapytania do bazy danych:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        if (results.length === 0) {
            return res.status(404).send('Zgłoszenie nie znalezione');
        }

        // Pobieramy informacje o szkole, do której przypisane jest zgłoszenie
        const szkolaId = results[0].szkola_id;
        db.query('SELECT * FROM szkoły WHERE id = ?', [szkolaId], (err, szkolaResults) => {
            if (err) {
                console.error('Błąd zapytania do bazy danych:', err);
                return res.status(500).send('Błąd bazy danych');
            }

            if (szkolaResults.length === 0) {
                return res.status(404).send('Szkoła nie znaleziona');
            }

            // Wysyłamy dane do widoku
            res.render('admin/viewsreport', { zgloszenie: results[0], szkola: szkolaResults[0] });
        });
    });
});

app.get('/admin/zgloszenie/:id/delete', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Jeśli użytkownik nie jest zalogowany, przekieruj go do logowania
    }

    const zgloszenieId = req.params.id;

    // Usuwamy zgłoszenie z bazy danych
    db.query('DELETE FROM zgloszenia WHERE id = ?', [zgloszenieId], (err, result) => {
        if (err) {
            console.error('Błąd zapytania do bazy danych:', err);
            return res.status(500).send('Błąd bazy danych');
        }

        // Po usunięciu, przekierowujemy do strony z listą zgłoszeń
        res.redirect('/admin/schools');
    });
});

// Wylogowanie użytkownika
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send('Błąd wylogowywania');
        }
        res.redirect('/');
    });
});

// Uruchomienie serwera
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
