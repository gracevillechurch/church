
/* =========================================================
   GRACEVILLE CONSERVATIVE BAPTIST CHURCH
   Main Website JavaScript
   File: js/app.js
   ========================================================= */

/* -------------------------
   API CONFIGURATION
------------------------- */

const API_BASE_URL = window.CHURCH_API_BASE_URL || "/api";

const ORDER_STATUSES = [
    "pending",
    "processing",
    "completed",
    "cancelled"
];


/* -------------------------
   API REQUEST HELPER
------------------------- */

async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    // Let the browser set the multipart boundary for file uploads.
    if (
        options.body &&
        !(options.body instanceof FormData) &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(API_BASE_URL + path, {
        ...options,
        headers
    });

    if (!response.ok) {
        let message = `API error ${response.status}`;

        try {
            const result = await response.json();
            message = result.message || message;
        } catch {
            // The server did not return JSON.
        }

        throw new Error(message);
    }

    // Support endpoints that return no content.
    if (response.status === 204) {
        return null;
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return response.json();
    }

    return null;
}


/* -------------------------
   ADMIN SESSION
------------------------- */

function getAdminPassword() {
    return sessionStorage.getItem("churchAdminPassword") || "";
}

function setAdminPassword() {
    const password = prompt("Enter the website admin password");

    if (password === null) {
        return;
    }

    if (!password.trim()) {
        toast("Please enter a password.");
        return;
    }

    sessionStorage.setItem("churchAdminPassword", password);
    toast("Admin password saved for this browser session.");
}

function clearAdminPassword() {
    sessionStorage.removeItem("churchAdminPassword");
    toast("Admin session password cleared.");
}


/* -------------------------
   SAFE HTML AND IMAGE HELPERS
------------------------- */

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function safeImageUrl(value) {
    if (!value || typeof value !== "string") {
        return "";
    }

    try {
        const url = new URL(value, window.location.origin);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "";
        }

        return url.href;
    } catch {
        return "";
    }
}

function formatMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "₱0";
    }

    return "₱" + amount.toLocaleString("en-PH", {
        maximumFractionDigits: 2
    });
}

function getErrorMessage(error, fallback) {
    return error instanceof Error && error.message
        ? error.message
        : fallback;
}


/* -------------------------
   NOTIFICATION TOAST
------------------------- */

let toastTimer;

function toast(message) {
    const element = document.querySelector(".toast");

    if (!element) {
        alert(message);
        return;
    }

    clearTimeout(toastTimer);

    element.textContent = message;
    element.style.display = "block";

    toastTimer = setTimeout(() => {
        element.style.display = "none";
    }, 3500);
}


/* -------------------------
   NAVIGATION
------------------------- */

function nav() {
    const button = document.querySelector(".menu");
    const links = document.querySelector(".links");

    if (button && links) {
        button.setAttribute("aria-expanded", "false");

        button.addEventListener("click", () => {
            const isOpen = links.classList.toggle("open");

            button.setAttribute("aria-expanded", String(isOpen));
            button.setAttribute(
                "aria-label",
                isOpen ? "Close navigation menu" : "Open navigation menu"
            );
        });

        // Close the mobile menu after a navigation link is selected.
        links.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", () => {
                links.classList.remove("open");
                button.setAttribute("aria-expanded", "false");
                button.setAttribute("aria-label", "Open navigation menu");
            });
        });
    }

    // Highlight the current page.
    const currentPage = window.location.pathname
        .split("/")
        .pop() || "index.html";

    document.querySelectorAll(".links a").forEach(link => {
        const href = link.getAttribute("href");

        if (href === currentPage) {
            link.classList.add("active");
            link.setAttribute("aria-current", "page");
        } else {
            link.classList.remove("active");
            link.removeAttribute("aria-current");
        }
    });
}


/* -------------------------
   CUSTOMER ORDER SUBMISSION
------------------------- */

async function submitOrder(event) {
    event.preventDefault();

    const form = event.target;

    if (!form.reportValidity()) {
        return;
    }

    const orderData = Object.fromEntries(
        new FormData(form).entries()
    );

    try {
        const result = await api("/orders", {
            method: "POST",
            body: JSON.stringify(orderData)
        });

        const reference = result?.id;

        toast(
            reference
                ? `Order request submitted! Reference: ${reference}`
                : "Order request submitted successfully!"
        );

        form.reset();

        // Refresh available products if an order changed the list.
        loadProducts();
    } catch (error) {
        toast(
            getErrorMessage(
                error,
                "Unable to submit order. Please try again."
            )
        );
    }
}


/* -------------------------
   ADMIN ORDER DASHBOARD
------------------------- */

async function loadOrders() {
    const tableBody = document.querySelector("#orders");

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML =
        '<tr><td colspan="7">Loading orders...</td></tr>';

    try {
        const orders = await api("/orders", {
            headers: {
                "x-admin-password": getAdminPassword()
            }
        });

        if (!Array.isArray(orders)) {
            throw new Error("The server returned an invalid orders list.");
        }

        if (orders.length === 0) {
            tableBody.innerHTML =
                '<tr><td colspan="7">No orders yet.</td></tr>';
        } else {
            tableBody.innerHTML = orders.map(order => {
                const status = ORDER_STATUSES.includes(order.status)
                    ? order.status
                    : "pending";

                const options = ORDER_STATUSES.map(item => `
                    <option value="${item}" ${item === status ? "selected" : ""}>
                        ${item.charAt(0).toUpperCase() + item.slice(1)}
                    </option>
                `).join("");

                return `
                    <tr>
                        <td><b>${esc(order.id)}</b></td>
                        <td>${esc(order.customer)}</td>
                        <td>${esc(order.item)}</td>
                        <td>${esc(order.qty)}</td>
                        <td>${formatMoney(order.total)}</td>
                        <td>
                            <span class="status ${status}">
                                ${esc(status)}
                            </span>
                        </td>
                        <td>
                            <select
                                class="order-status-select"
                                data-order-id="${esc(order.id)}"
                                aria-label="Change order status"
                            >
                                ${options}
                            </select>
                        </td>
                    </tr>
                `;
            }).join("");
        }

        // Update dashboard statistics safely.
        const countElement = document.querySelector("#count");
        const pendingElement = document.querySelector("#pending");
        const revenueElement = document.querySelector("#revenue");

        if (countElement) {
            countElement.textContent = orders.length;
        }

        if (pendingElement) {
            pendingElement.textContent = orders.filter(
                order => order.status === "pending"
            ).length;
        }

        if (revenueElement) {
            const revenue = orders
                .filter(order => order.status === "completed")
                .reduce((total, order) => {
                    const amount = Number(order.total);
                    return total + (Number.isFinite(amount) ? amount : 0);
                }, 0);

            revenueElement.textContent = formatMoney(revenue);
        }

    } catch (error) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    ${esc(getErrorMessage(
                        error,
                        "Unable to load orders."
                    ))}
                    — check your server and admin password.
                </td>
            </tr>
        `;
    }
}


/* -------------------------
   UPDATE ORDER STATUS
------------------------- */

async function updateStatus(id, status) {
    if (!ORDER_STATUSES.includes(status)) {
        toast("Invalid order status.");
        return;
    }

    try {
        await api("/orders/" + encodeURIComponent(id), {
            method: "PATCH",
            headers: {
                "x-admin-password": getAdminPassword()
            },
            body: JSON.stringify({ status })
        });

        toast("Order status updated successfully.");
        await loadOrders();

    } catch (error) {
        toast(
            getErrorMessage(error, "Unable to update order status.")
        );

        await loadOrders();
    }
}


/* -------------------------
   EVENT PHOTO GALLERIES
------------------------- */

async function loadGallery() {
    const galleries = document.querySelectorAll("[data-gallery]");

    if (!galleries.length) {
        return;
    }

    // Show a loading message in each gallery.
    galleries.forEach(gallery => {
        gallery.innerHTML =
            '<p class="muted">Loading event photos...</p>';
    });

    try {
        const events = await api("/events");

        if (!Array.isArray(events)) {
            throw new Error("The server returned an invalid events list.");
        }

        galleries.forEach(gallery => {
            const page = gallery.dataset.gallery;

            const items = events.filter(event => event.page === page);

            if (!items.length) {
                gallery.innerHTML =
                    '<p class="muted">Event photos will appear here.</p>';
                return;
            }

            gallery.innerHTML = items.map(event => {
                const image = safeImageUrl(event.image);

                return `
                    <article class="event-card">
                        ${
                            image
                                ? `
                                    <img
                                        src="${esc(image)}"
                                        alt="${esc(event.title || "Church event photo")}"
                                        loading="lazy"
                                    >
                                `
                                : ""
                        }

                        <div>
                            <h3>${esc(event.title || "Church Event")}</h3>

                            ${
                                event.date
                                    ? `<p>${esc(event.date)}</p>`
                                    : ""
                            }

                            <p>${esc(event.description || "")}</p>
                        </div>
                    </article>
                `;
            }).join("");
        });

    } catch (error) {
        galleries.forEach(gallery => {
            gallery.innerHTML =
                '<p class="muted">Event gallery is temporarily unavailable. Please try again later.</p>';
        });

        console.error("Gallery loading failed:", error);
    }
}


/* -------------------------
   PRODUCTS AND ORDER FORM
------------------------- */

async function loadProducts() {
    const select = document.querySelector('select[name="item"]');
    const productList = document.querySelector("#product-list");

    if (!select && !productList) {
        return;
    }

    try {
        const products = await api("/products");

        if (!Array.isArray(products)) {
            throw new Error("The server returned an invalid products list.");
        }

        if (select) {
            const previousValue = select.value;

            select.innerHTML =
                '<option value="">Choose an item</option>' +
                products.map(product => `
                    <option value="${esc(product.name)}">
                        ${esc(product.name)} — ${formatMoney(product.price)}
                    </option>
                `).join("") +
                '<option value="Other (price to be confirmed)">Other (price to be confirmed)</option>';

            // Keep the selected item if it is still available.
            if (
                previousValue &&
                Array.from(select.options).some(
                    option => option.value === previousValue
                )
            ) {
                select.value = previousValue;
            }
        }

        if (productList) {
            productList.innerHTML = products.length
                ? products.map(product => `
                    <article class="product-card">
                        <h3>${esc(product.name)}</h3>
                        <p>${esc(product.description || "")}</p>
                        <strong>${formatMoney(product.price)}</strong>
                    </article>
                `).join("")
                : '<p class="muted">No products are available at the moment.</p>';
        }

    } catch (error) {
        console.error("Product loading failed:", error);

        if (productList) {
            productList.innerHTML =
                '<p class="muted">Products are temporarily unavailable.</p>';
        }
    }
}


/* -------------------------
   ADMIN EVENT PHOTO UPLOAD
------------------------- */

async function uploadEvent(event) {
    event.preventDefault();

    const form = event.target;

    if (!form.reportValidity()) {
        return;
    }

    const formData = new FormData(form);

    try {
        await api("/events", {
            method: "POST",
            headers: {
                "x-admin-password": getAdminPassword()
            },
            body: formData
        });

        toast("Event photo published successfully.");

        form.reset();

        // Refresh any gallery on the current page.
        await loadGallery();

    } catch (error) {
        toast(
            getErrorMessage(error, "Photo upload failed. Please try again.")
        );
    }
}


/* -------------------------
   INITIALIZE WEBSITE
------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    nav();
    loadGallery();
    loadProducts();

    // Handle status changes without inline JavaScript in generated HTML.
    document.addEventListener("change", event => {
        const select = event.target.closest(".order-status-select");

        if (!select) {
            return;
        }

        const orderId = select.dataset.orderId;

        if (orderId) {
            updateStatus(orderId, select.value);
        }
    });
});
