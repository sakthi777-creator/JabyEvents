const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const PORT = 3001;
// Load environment variables
// require('dotenv').config();
// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'jobi_events_secret_key_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true on Railway
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Database connection - UPDATE THIS WITH YOUR PASSWORD
// Database connection - USING ENVIRONMENT VARIABLES
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123',
    database: process.env.DB_NAME || 'jobi_events',
    port: process.env.DB_PORT || 3306
});

// Connect to database
db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        console.log('\n💡 Please:');
        console.log('1. Make sure MySQL is running');
        console.log('2. Update password in server.js');
        console.log('3. Create database: CREATE DATABASE jobi_events;');
        return;
    }
    console.log('✅ Connected to MySQL database');
    
    // Create tables one by one to avoid syntax issues
    const createAdminTable = `
        CREATE TABLE IF NOT EXISTS admin (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
    
    const createBookingsTable = `
        CREATE TABLE IF NOT EXISTS bookings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            event_date DATE NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            price DECIMAL(10,2) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
    
    const createReviewsTable = `
        CREATE TABLE IF NOT EXISTS reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            review_text TEXT NOT NULL,
            rating INT DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            approved TINYINT(1) DEFAULT 1
        )`;
    
    const createOffersTable = `
        CREATE TABLE IF NOT EXISTS offers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(200) NOT NULL,
            description TEXT NOT NULL,
            discount_percent INT DEFAULT 0,
            valid_until DATE,
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
    
    const createEventPricesTable = `
        CREATE TABLE IF NOT EXISTS event_prices (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(100) UNIQUE NOT NULL,
            base_price DECIMAL(10,2) NOT NULL,
            description TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`;

    const createInquiriesTable = `
        CREATE TABLE IF NOT EXISTS contact_inquiries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL,
            mobile VARCHAR(20) NOT NULL,
            event_name VARCHAR(200) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`;
    
    // Execute table creation sequentially
    db.query(createAdminTable, (err) => {
        if (err) console.error('Error creating admin table:', err);
        else console.log('✅ Admin table ready');
        
        db.query(createBookingsTable, (err) => {
            if (err) console.error('Error creating bookings table:', err);
            else console.log('✅ Bookings table ready');
            
            db.query(createReviewsTable, (err) => {
                if (err) console.error('Error creating reviews table:', err);
                else console.log('✅ Reviews table ready');
                
                db.query(createOffersTable, (err) => {
                    if (err) console.error('Error creating offers table:', err);
                    else console.log('✅ Offers table ready');
                    
                    db.query(createEventPricesTable, (err) => {
                        if (err) console.error('Error creating event_prices table:', err);
                        else console.log('✅ Event prices table ready');
                        
                        // Always ensure admin exists with correct bcrypt password
                        const defaultAdmin = 'admin';
                        const defaultPassword = bcrypt.hashSync('admin123', 10);
                        
                        // Delete and re-insert to guarantee fresh bcrypt hash (fixes plain-text password bug)
                        db.query('DELETE FROM admin WHERE username = ?', [defaultAdmin], () => {
                            db.query('INSERT INTO admin (username, password) VALUES (?, ?)', [defaultAdmin, defaultPassword], (err) => {
                                if (err) console.error('Error inserting default admin:', err);
                                else console.log('✅ Default admin ready: admin / admin123');
                            });
                        });
                        
                        // Insert default event prices
                        const defaultPrices = [
                            ['Wedding', 250000.00, 'Traditional or contemporary wedding ceremonies'],
                            ['Corporate Events', 150000.00, 'Conferences, summits, and corporate gatherings'],
                            ['Birthday Party', 50000.00, 'Birthday celebrations for all ages'],
                            ['DJ', 30000.00, 'Professional DJ services with sound system'],
                            ['Celebrity Management', 100000.00, 'Celebrity appearances and management'],
                            ['Concert nights', 200000.00, 'Live concerts and musical events'],
                            ['Private Parties', 40000.00, 'Customized private celebrations'],
                            ['School Party', 25000.00, 'School events and cultural programs'],
                            ['sound,light,stage', 35000.00, 'Professional AV setup and stage design'],
                            ['Sports Events', 80000.00, 'Sports tournaments and events'],
                            ['stalls & Exhibitions', 45000.00, 'Exhibition stall setup and management'],
                            ['Catering Service', 60000.00, 'Food and beverage services']
                        ];
                        
                        defaultPrices.forEach(price => {
                            db.query('INSERT IGNORE INTO event_prices (event_type, base_price, description) VALUES (?, ?, ?)', price, (err) => {
                                if (err) console.error('Error inserting default price:', err);
                            });
                        });

                        db.query(createInquiriesTable, (err) => {
                            if (err) {
                                console.error('Error creating contact inquiries table:', err);
                            } else {
                                console.log('✅ Contact inquiries table ready');
                                const safeAlter = (query, errLabel) => {
                                    db.query(query, (err) => {
                                        if (err && err.code !== 'ER_DUP_FIELDNAME' && err.code !== 'ER_BAD_FIELD_ERROR' && err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
                                            console.error(errLabel, err);
                                        }
                                    });
                                };

                                safeAlter('ALTER TABLE contact_inquiries ADD COLUMN name VARCHAR(100) NOT NULL AFTER id', 'Error adding name column:');
                                safeAlter('ALTER TABLE contact_inquiries ADD COLUMN email VARCHAR(150) NOT NULL AFTER name', 'Error adding email column:');
                                safeAlter('ALTER TABLE contact_inquiries ADD COLUMN mobile VARCHAR(20) NOT NULL AFTER email', 'Error adding mobile column:');
                                safeAlter('ALTER TABLE contact_inquiries ADD COLUMN event_name VARCHAR(200) NOT NULL AFTER mobile', 'Error adding event_name column:');
                                safeAlter('ALTER TABLE contact_inquiries ADD COLUMN message TEXT NOT NULL AFTER event_name', 'Error adding message column:');
                                safeAlter('ALTER TABLE contact_inquiries DROP COLUMN phone', 'Info dropping old phone column:');
                                safeAlter('ALTER TABLE contact_inquiries DROP COLUMN min_budget', 'Info dropping old min_budget column:');
                            }
                        });

                        console.log('✅ All tables created and data inserted');
                    });
                });
            });
        });
    });
});

// ============== MAIN PAGE ==============
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    
    if (!fs.existsSync(htmlPath)) {
        return res.send(`
            <h1>Please place your index.html file in the public folder</h1>
            <p>Location: ${htmlPath}</p>
            <p>Create a folder called 'public' and put your index.html inside it.</p>
        `);
    }
    
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Fetch reviews
    db.query('SELECT * FROM reviews WHERE approved = 1 ORDER BY created_at DESC LIMIT 6', (err, reviews) => {
        let reviewsHTML = '';
        if (!err && reviews && reviews.length > 0) {
            reviewsHTML = reviews.map(review => `
                <div class="review-card fade-in visible">
                    <div class="review-stars">
                        ${'<i class="fas fa-star"></i>'.repeat(review.rating)}
                    </div>
                    <p class="review-text">"${review.review_text.replace(/"/g, '&quot;')}"</p>
                    <p class="reviewer-name">${review.name}</p>
                    <p class="reviewer-event">${review.event_type}</p>
                </div>
            `).join('');
        } else {
            reviewsHTML = '<div class="review-card">No reviews yet. Be the first to review!</div>';
        }
        
        // Fetch offers
        db.query('SELECT * FROM offers WHERE is_active = 1 AND (valid_until IS NULL OR valid_until >= CURDATE())', (err, offers) => {
            let offersHTML = '';
            if (!err && offers && offers.length > 0) {
                offersHTML = `<div style="max-width: 1200px; margin: 20px auto;">` + 
                    offers.map(offer => `
                        <div style="background: linear-gradient(135deg, #D4AF37, #AA8C2C); padding: 15px 20px; border-radius: 10px; margin-bottom: 15px; color: white;">
                            <h4 style="margin: 0 0 5px 0;">🎉 ${offer.title}</h4>
                            <p style="margin: 0;">${offer.description}</p>
                            ${offer.discount_percent ? `<strong>${offer.discount_percent}% OFF</strong>` : ''}
                        </div>
                    `).join('') + `</div>`;
            }
            
            // Fetch prices
            db.query('SELECT * FROM event_prices', (err, prices) => {
                let pricesJSON = '{}';
                if (!err && prices) {
                    pricesJSON = JSON.stringify(prices.reduce((acc, p) => {
                        acc[p.event_type] = p.base_price;
                        return acc;
                    }, {}));
                }
                
                // Replace placeholders
                html = html.replace(/<!-- DYNAMIC_REVIEWS -->/g, reviewsHTML);
                html = html.replace('<!-- DYNAMIC_OFFERS -->', offersHTML);
                html = html.replace('<!-- DYNAMIC_PRICES -->', `<script>window.eventPrices = ${pricesJSON};</script>`);
                res.send(html);
            });
        });
    });
});

app.get('/index.html', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    if (!fs.existsSync(htmlPath)) {
        return res.status(404).send('index.html not found');
    }
    let html = fs.readFileSync(htmlPath, 'utf8');

    db.query('SELECT * FROM reviews WHERE approved = 1 ORDER BY created_at DESC LIMIT 6', (err, reviews) => {
        let reviewsHTML = '';
        if (!err && reviews && reviews.length > 0) {
            reviewsHTML = reviews.map(review => `
                <div class="review-card fade-in visible">
                    <div class="review-stars">
                        ${'<i class="fas fa-star"></i>'.repeat(review.rating)}
                    </div>
                    <p class="review-text">"${review.review_text.replace(/"/g, '&quot;')}"</p>
                    <p class="reviewer-name">${review.name}</p>
                    <p class="reviewer-event">${review.event_type}</p>
                </div>
            `).join('');
        } else {
            reviewsHTML = '<div class="review-card">No reviews yet. Be the first to review!</div>';
        }

        db.query('SELECT * FROM offers WHERE is_active = 1 AND (valid_until IS NULL OR valid_until >= CURDATE())', (err, offers) => {
            let offersHTML = '';
            if (!err && offers && offers.length > 0) {
                offersHTML = `<div style="max-width: 1200px; margin: 20px auto;">` + 
                    offers.map(offer => `
                        <div style="background: linear-gradient(135deg, #D4AF37, #AA8C2C); padding: 15px 20px; border-radius: 10px; margin-bottom: 15px; color: white;">
                            <h4 style="margin: 0 0 5px 0;">🎉 ${offer.title}</h4>
                            <p style="margin: 0;">${offer.description}</p>
                            ${offer.discount_percent ? `<strong>${offer.discount_percent}% OFF</strong>` : ''}
                        </div>
                    `).join('') + `</div>`;
            }

            db.query('SELECT * FROM event_prices', (err, prices) => {
                let pricesJSON = '{}';
                if (!err && prices) {
                    pricesJSON = JSON.stringify(prices.reduce((acc, p) => {
                        acc[p.event_type] = p.base_price;
                        return acc;
                    }, {}));
                }

                html = html.replace(/<!-- DYNAMIC_REVIEWS -->/g, reviewsHTML);
                html = html.replace('<!-- DYNAMIC_OFFERS -->', offersHTML);
                html = html.replace('<!-- DYNAMIC_PRICES -->', `<script>window.eventPrices = ${pricesJSON};</script>`);
                res.send(html);
            });
        });
    });
});

app.use(express.static('public', { index: false }));

// ============== API ROUTES ==============

// Submit Booking — handles both POST (JSON) and GET (query params fallback)
function handleBookingRequest(req, res) {
    // Support both JSON body (POST) and query params (GET fallback)
    const name       = req.body?.name       || req.query?.name;
    const phone      = req.body?.phone      || req.query?.phone;
    const event_type = req.body?.event_type || req.query?.event_type;
    const event_date = req.body?.event_date || req.query?.event_date;
    
    console.log('📝 New booking request:', { name, phone, event_type, event_date });
    
    if (!name || !phone || !event_type || !event_date) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    db.query('SELECT base_price FROM event_prices WHERE event_type = ?', [event_type], (err, priceResult) => {
        const price = priceResult && priceResult.length > 0 ? priceResult[0].base_price : null;
        
        db.query(
            'INSERT INTO bookings (name, phone, event_type, event_date, price) VALUES (?, ?, ?, ?, ?)',
            [name, phone, event_type, event_date, price],
            (err, result) => {
                if (err) {
                    console.error('Booking error:', err);
                    return res.status(500).json({ error: 'Failed to submit booking' });
                }
                console.log('✅ Booking saved with ID:', result.insertId);
                res.json({ success: true, message: '✅ Booking request submitted! We will contact you within 24 hours.' });
            }
        );
    });
}

app.post('/api/bookings', handleBookingRequest);
app.get('/api/bookings', handleBookingRequest);  // fallback for accidental GET

// Submit Review — handles both POST (JSON) and GET (query params fallback)
function handleReviewRequest(req, res) {
    const name        = req.body?.name        || req.query?.name;
    const event_type  = req.body?.event_type  || req.query?.event_type;
    const review_text = req.body?.review_text || req.query?.review_text;
    const rating      = req.body?.rating      || req.query?.rating || 5;
    
    console.log('📝 New review:', { name, event_type });
    
    if (!name || !event_type || !review_text) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    db.query(
        'INSERT INTO reviews (name, event_type, review_text, rating) VALUES (?, ?, ?, ?)',
        [name, event_type, review_text, rating],
        (err, result) => {
            if (err) {
                console.error('Review error:', err);
                return res.status(500).json({ error: 'Failed to submit review' });
            }
            console.log('✅ Review saved with ID:', result.insertId);
            res.json({ success: true, message: '✅ Thank you for your review!' });
        }
    );
}

app.post('/api/reviews', handleReviewRequest);

app.get('/api/reviews', (req, res) => {
    console.log('📣 Public reviews request');
    db.query('SELECT * FROM reviews WHERE approved = 1 ORDER BY created_at DESC LIMIT 6', (err, reviews) => {
        if (err) {
            console.error('Failed to fetch reviews:', err);
            return res.status(500).json({ error: 'Failed to load reviews' });
        }
        res.json(reviews || []);
    });
});

app.get('/api/bookings/status', (req, res) => {
    const phone = req.query.phone?.trim();
    const name = req.query.name?.trim();
    if (!phone) {
        return res.status(400).json({ error: 'Phone number is required to check booking status' });
    }

    let query = 'SELECT id, name, phone, event_type, event_date, status, price, created_at FROM bookings WHERE phone = ?';
    const params = [phone];
    if (name) {
        query += ' AND name = ?';
        params.push(name);
    }
    query += ' ORDER BY created_at DESC';

    db.query(query, params, (err, bookings) => {
        if (err) {
            console.error('Booking status error:', err);
            return res.status(500).json({ error: 'Unable to fetch booking status' });
        }
        res.json({ bookings: bookings || [] });
    });
});

app.post('/api/inquiries', (req, res) => {
    const { name, email, mobile, event_name, message } = req.body;
    console.log('📝 New inquiry:', { name, email, mobile, event_name });
    if (!name || !email || !mobile || !event_name || !message) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.query(
        'INSERT INTO contact_inquiries (name, email, mobile, event_name, message) VALUES (?, ?, ?, ?, ?)',
        [name, email, mobile, event_name, message],
        (err, result) => {
            if (err) {
                console.error('Inquiry error:', err);
                return res.status(500).json({ error: 'Failed to save inquiry' });
            }
            res.json({ success: true, message: 'Inquiry submitted successfully. Our team will get back to you soon.' });
        }
    );
});

// Get Offers
app.get('/api/offers', (req, res) => {
    db.query('SELECT * FROM offers WHERE is_active = 1 AND (valid_until IS NULL OR valid_until >= CURDATE())', (err, offers) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(offers || []);
    });
});

// Get Event Prices
app.get('/api/prices', (req, res) => {
    db.query('SELECT * FROM event_prices', (err, prices) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(prices || []);
    });
});

// ============== ADMIN AUTH ==============

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log('🔐 Admin login attempt:', username);
    
    db.query('SELECT * FROM admin WHERE username = ?', [username], (err, users) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (users.length === 0) {
            console.log('❌ Admin not found:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        let passwordValid = false;
        
        try {
            passwordValid = bcrypt.compareSync(password, user.password);
        } catch(e) {
            passwordValid = (password === user.password);
        }
        
        if (passwordValid) {
            req.session.adminId = user.id;
            req.session.adminUsername = user.username;
            console.log('✅ Admin logged in:', username);
            res.json({ success: true, redirect: 'https://jabyevents.up.railway.app/admin/dashboard' });
        } else {
            console.log('❌ Invalid password for:', username);
            res.status(401).json({ error: 'Invalid credentials' });
        }
    });
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
    res.json({ loggedIn: !!req.session.adminId, username: req.session.adminUsername });
});

// ============== ADMIN PAGES ==============

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin/dashboard', (req, res) => {
    if (!req.session.adminId) {
        return res.redirect('/admin/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// ============== ADMIN API ==============

app.get('/api/admin/bookings', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT * FROM bookings ORDER BY created_at DESC', (err, bookings) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(bookings);
    });
});

app.put('/api/admin/bookings/:id', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    const { status, price } = req.body;
    let query = 'UPDATE bookings SET status = ?';
    let params = [status];
    if (price !== undefined) {
        query += ', price = ?';
        params.push(price);
    }
    query += ' WHERE id = ?';
    params.push(req.params.id);
    db.query(query, params, (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});

app.delete('/api/admin/bookings/:id', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('DELETE FROM bookings WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});

app.get('/api/admin/reviews', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT * FROM reviews ORDER BY created_at DESC', (err, reviews) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(reviews);
    });
});

app.get('/api/admin/inquiries', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT * FROM contact_inquiries ORDER BY created_at DESC', (err, inquiries) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(inquiries);
    });
});

app.delete('/api/admin/reviews/:id', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('DELETE FROM reviews WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});

app.get('/api/admin/offers', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT * FROM offers ORDER BY created_at DESC', (err, offers) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(offers);
    });
});

app.post('/api/admin/offers', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description, discount_percent, valid_until } = req.body;
    db.query(
        'INSERT INTO offers (title, description, discount_percent, valid_until) VALUES (?, ?, ?, ?)',
        [title, description, discount_percent || 0, valid_until || null],
        (err, result) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true, id: result.insertId });
        }
    );
});

app.put('/api/admin/offers/:id', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    const { title, description, discount_percent, valid_until, is_active } = req.body;
    db.query(
        'UPDATE offers SET title = ?, description = ?, discount_percent = ?, valid_until = ?, is_active = ? WHERE id = ?',
        [title, description, discount_percent, valid_until, is_active, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true });
        }
    );
});

app.delete('/api/admin/offers/:id', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('DELETE FROM offers WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});

app.get('/api/admin/prices', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    db.query('SELECT * FROM event_prices ORDER BY event_type', (err, prices) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(prices);
    });
});

app.put('/api/admin/prices/:id', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    const { base_price, description } = req.body;
    db.query(
        'UPDATE event_prices SET base_price = ?, description = ? WHERE id = ?',
        [base_price, description, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ success: true });
        }
    );
});

app.get('/api/admin/stats', (req, res) => {
    if (!req.session.adminId) return res.status(401).json({ error: 'Unauthorized' });
    
    const queries = {
        totalBookings: 'SELECT COUNT(*) as count FROM bookings',
        pendingBookings: 'SELECT COUNT(*) as count FROM bookings WHERE status = "pending"',
        approvedBookings: 'SELECT COUNT(*) as count FROM bookings WHERE status = "approved"',
        rejectedBookings: 'SELECT COUNT(*) as count FROM bookings WHERE status = "rejected"',
        totalReviews: 'SELECT COUNT(*) as count FROM reviews',
        totalRevenue: 'SELECT SUM(price) as total FROM bookings WHERE status = "approved"'
    };
    
    const results = {};
    let completed = 0;
    const total = Object.keys(queries).length;
    
    for (const [key, query] of Object.entries(queries)) {
        db.query(query, (err, result) => {
            results[key] = err ? { count: 0 } : result[0];
            completed++;
            if (completed === total) {
                res.json(results);
            }
        });
    }
});

// Create admin login page if not exists
const adminLoginPath = path.join(__dirname, 'public', 'admin-login.html');
if (!fs.existsSync(adminLoginPath)) {
    const adminLoginHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Admin Login - Jobi Events</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 50px;
            border-radius: 20px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            width: 100%;
            max-width: 450px;
            text-align: center;
        }
        .logo {
            font-family: 'Playfair Display', serif;
            font-size: 2rem;
            color: #D4AF37;
            margin-bottom: 30px;
        }
        h2 { margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; text-align: left; }
        label { display: block; margin-bottom: 8px; color: #666; }
        input {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 1rem;
        }
        input:focus { outline: none; border-color: #D4AF37; }
        button {
            width: 100%;
            padding: 14px;
            background: #D4AF37;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
        }
        button:hover { background: #AA8C2C; }
        .error { color: #e74c3c; margin-top: 15px; }
        .back-link {
            margin-top: 20px;
            display: inline-block;
            color: #D4AF37;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo"><i class="fas fa-crown"></i> JOBI EVENTS</div>
        <h2>Admin Login</h2>
        <form id="loginForm">
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="username" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="password" required>
            </div>
            <button type="submit">Login</button>
            <div class="error" id="errorMsg"></div>
        </form>
        <a href="/" class="back-link">← Back to Website</a>
    </div>
    <script>
        document.getElementById('loginForm').onsubmit = async (e) => {
            e.preventDefault();
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value
                })
            });
            const data = await res.json();
            if (data.success) window.location.href = data.redirect;
            else document.getElementById('errorMsg').textContent = data.error;
        };
    </script>
</body>
</html>`;
    fs.writeFileSync(adminLoginPath, adminLoginHTML);
    console.log('✅ Created admin-login.html');
}

// Admin dashboard served as static file
const adminDashboardPath = path.join(__dirname, 'public', 'admin-dashboard.html');
if (false) { // disabled auto-generation — use static admin-dashboard.html
    const adminDashboardHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Admin Dashboard - Jobi Events</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', sans-serif; background: #f5f5f5; }
        .header { background: white; padding: 20px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; padding: 20px; border-radius: 12px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .stat-number { font-size: 2rem; font-weight: bold; color: #D4AF37; }
        .card { background: white; border-radius: 12px; margin-bottom: 30px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .card-header { padding: 20px; border-bottom: 1px solid #eee; font-size: 1.2rem; font-weight: bold; }
        .table-container { overflow-x: auto; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #f8f8f8; font-weight: 600; }
        button { padding: 5px 10px; margin: 2px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
        .approve { background: #28a745; color: white; }
        .reject { background: #dc3545; color: white; }
        .delete { background: #6c757d; color: white; }
        .logout { background: #e74c3c; color: white; padding: 10px 20px; }
        .status-badge { padding: 4px 8px; border-radius: 20px; font-size: 12px; display: inline-block; }
        .status-pending { background: #fff3cd; color: #856404; }
        .status-approved { background: #d4edda; color: #155724; }
        .status-rejected { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="header">
        <h1><i class="fas fa-crown" style="color: #D4AF37;"></i> Jobi Events Admin</h1>
        <div>
            <span>Welcome, <span id="adminName">Admin</span></span>
            <button class="logout" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Logout</button>
        </div>
    </div>
    <div class="container">
        <div class="stats" id="stats">
            <div class="stat-card"><h3>Total Bookings</h3><div class="stat-number" id="totalBookings">0</div></div>
            <div class="stat-card"><h3>Pending</h3><div class="stat-number" id="pendingBookings">0</div></div>
            <div class="stat-card"><h3>Approved</h3><div class="stat-number" id="approvedBookings">0</div></div>
            <div class="stat-card"><h3>Reviews</h3><div class="stat-number" id="totalReviews">0</div></div>
            <div class="stat-card"><h3>Revenue</h3><div class="stat-number" id="totalRevenue">₹0</div></div>
        </div>
        
        <div class="card">
            <div class="card-header">📅 Bookings</div>
            <div class="table-container">
                <table id="bookingsTable">
                    <thead>运转<th>ID</th><th>Name</th><th>Phone</th><th>Event</th><th>Date</th><th>Price</th><th>Status</th><th>Actions</th>脊</thead>
                    <tbody></tbody>
                能有
            </div>
        </div>
        
        <div class="card">
            <div class="card-header">⭐ Reviews</div>
            <div class="table-container">
                <table id="reviewsTable">
                    <thead>运转<th>ID</th><th>Name</th><th>Event</th><th>Review</th><th>Rating</th><th>Actions</th>脊</thead>
                    <tbody></tbody>
                能有
            </div>
        </div>
    </div>
    <script>
        async function checkAuth() {
            const res = await fetch('/api/admin/check');
            const data = await res.json();
            if (!data.loggedIn) window.location.href = '/admin/login';
            else document.getElementById('adminName').textContent = data.username;
        }
        
        async function logout() {
            await fetch('/api/admin/logout', { method: 'POST' });
            window.location.href = '/admin/login';
        }
        
        async function loadStats() {
            const res = await fetch('/api/admin/stats');
            const data = await res.json();
            document.getElementById('totalBookings').textContent = data.totalBookings?.count || 0;
            document.getElementById('pendingBookings').textContent = data.pendingBookings?.count || 0;
            document.getElementById('approvedBookings').textContent = data.approvedBookings?.count || 0;
            document.getElementById('totalReviews').textContent = data.totalReviews?.count || 0;
            document.getElementById('totalRevenue').textContent = '₹' + (data.totalRevenue?.total || 0).toLocaleString();
        }
        
        async function loadBookings() {
            const res = await fetch('/api/admin/bookings');
            const bookings = await res.json();
            const tbody = document.querySelector('#bookingsTable tbody');
            tbody.innerHTML = '';
            for (let b of bookings) {
                const row = tbody.insertRow();
                row.insertCell(0).textContent = b.id;
                row.insertCell(1).textContent = b.name;
                row.insertCell(2).textContent = b.phone;
                row.insertCell(3).textContent = b.event_type;
                row.insertCell(4).textContent = new Date(b.event_date).toLocaleDateString();
                row.insertCell(5).textContent = b.price ? '₹' + b.price.toLocaleString() : 'N/A';
                row.insertCell(6).innerHTML = '<span class="status-badge status-' + b.status + '">' + b.status + '</span>';
                const actions = row.insertCell(7);
                if (b.status === 'pending') {
                    const approveBtn = document.createElement('button');
                    approveBtn.textContent = 'Approve';
                    approveBtn.className = 'approve';
                    approveBtn.onclick = () => updateStatus(b.id, 'approved');
                    actions.appendChild(approveBtn);
                    
                    const rejectBtn = document.createElement('button');
                    rejectBtn.textContent = 'Reject';
                    rejectBtn.className = 'reject';
                    rejectBtn.onclick = () => updateStatus(b.id, 'rejected');
                    actions.appendChild(rejectBtn);
                }
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'delete';
                deleteBtn.onclick = () => deleteBooking(b.id);
                actions.appendChild(deleteBtn);
            }
        }
        
        async function updateStatus(id, status) {
            await fetch('/api/admin/bookings/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            loadBookings();
            loadStats();
        }
        
        async function deleteBooking(id) {
            if (confirm('Are you sure?')) {
                await fetch('/api/admin/bookings/' + id, { method: 'DELETE' });
                loadBookings();
                loadStats();
            }
        }
        
        async function loadReviews() {
            const res = await fetch('/api/admin/reviews');
            const reviews = await res.json();
            const tbody = document.querySelector('#reviewsTable tbody');
            tbody.innerHTML = '';
            for (let r of reviews) {
                const row = tbody.insertRow();
                row.insertCell(0).textContent = r.id;
                row.insertCell(1).textContent = r.name;
                row.insertCell(2).textContent = r.event_type;
                row.insertCell(3).textContent = r.review_text.substring(0, 50) + (r.review_text.length > 50 ? '...' : '');
                row.insertCell(4).innerHTML = '★'.repeat(r.rating);
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'Delete';
                deleteBtn.className = 'delete';
                deleteBtn.onclick = () => deleteReview(r.id);
                const actions = row.insertCell(5);
                actions.appendChild(deleteBtn);
            }
        }
        
        async function deleteReview(id) {
            if (confirm('Delete this review?')) {
                await fetch('/api/admin/reviews/' + id, { method: 'DELETE' });
                loadReviews();
                loadStats();
            }
        }
        
        checkAuth();
        loadStats();
        loadBookings();
        loadReviews();
        
        setInterval(() => { loadStats(); loadBookings(); loadReviews(); }, 30000);
    </script>
</body>
</html>`;
    fs.writeFileSync(adminDashboardPath, adminDashboardHTML);
    console.log('✅ Created admin-dashboard.html');
}


// DEBUG ROUTES - Remove after testing
app.get('/debug/create-admin', (req, res) => {
    const bcrypt = require('bcryptjs');
    const username = 'admin';
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    
    // First delete existing admin
    db.query('DELETE FROM admin WHERE username = ?', [username], (err) => {
        if (err) console.error('Delete error:', err);
        
        // Then insert new admin
        db.query('INSERT INTO admin (username, password) VALUES (?, ?)', [username, hashedPassword], (err, result) => {
            if (err) {
                res.json({ success: false, error: err.message });
            } else {
                res.json({ success: true, message: 'Admin created! Try logging in with admin/admin123' });
            }
        });
    });
});

app.get('/debug/check-admin', (req, res) => {
    db.query('SELECT id, username FROM admin', (err, users) => {
        if (err) {
            res.json({ error: err.message });
        } else {
            res.json({ admins: users, count: users.length });
        }
    });
});
// Start server
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════╗
    ║     🎉 JOBI EVENTS MANAGEMENT SYSTEM                   ║
    ║     Server running on http://localhost:${PORT}          ║
    ║                                                       ║
    ║     🔐 Admin Login: http://localhost:${PORT}/admin/login ║
    ║     Username: admin                                   ║
    ║     Password: admin123                                ║
    ║                                                       ║
    ║     📱 Main Website: http://localhost:${PORT}           ║
    ╚═══════════════════════════════════════════════════════╝
    `);
});
