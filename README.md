# 🚇 Namma Route: AI-Powered Transit Navigator for Bengaluru

**The fastest, data-driven bus and metro navigator for Bengaluru.**

Namma Route is a high-performance transit routing engine designed to solve the complexity of Bengaluru's public transport. Built with a custom implementation of the **RAPTOR (Round-Based Public Transit Routing)** algorithm, it provides lightning-fast, multi-modal paths optimized for speed, cost, or minimal transfers.

---

## 🚀 Key Features

- **Multi-Criteria Intelligent Routing**: 
  - **Fastest**: Prioritizes the earliest arrival time.
  - **Min Fare**: Finds the cheapest path using an integrated fare calculator.
  - **Min Interchanges**: Reduces bus-to-bus switches with a virtual 100-minute penalty logic.
- **Route Explorer**: Click any bus number (like `378` or `500-D`) to visualize its entire route polyline and all stops on the map.
- **High-Contrast Map Visuals**: Custom-coded "Neon Palette" with segment outlining and transfer nodes for maximum clarity on dark-themed maps.
- **UI-Aware Navigation**: Intelligent `fitBounds` padding ([50, 50, 50, 400]) ensures the route is never hidden behind the sidebar.
- **Real-Time Data Safety**: Hardened Git LFS pointer detection to ensure seamless data loading from Vercel deployments.

---

## 🛠️ Technical Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **Mapping**: Google Maps JavaScript API (Custom Dark Mode)
- **Engine**: TypeScript-based RAPTOR implementation for O(N) pathfinding.
- **Data**: GTFS-derived JSON structures with spatial indexing for nearby stop discovery.
- **UI Components**: Radix UI for accessible popovers and radix-inspired design tokens.

---

## 📸 Screenshots

| Optimized Path View | Route Explorer View |
| :--- | :--- |
| ![Optimized Path](https://via.placeholder.com/600x400?text=Optimized+Path+View) | ![Route Explorer](https://via.placeholder.com/600x400?text=Route+Explorer+View) |
| *High-contrast neon segments and transfer nodes.* | *Full route visualization for specific bus numbers.* |

---

## ⚙️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/kanakmegha/BLRTransport.git
   cd BLRTransport
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Environment Variables**:
   Create a `.env` file in the root:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

---

## 🗺️ SEO & Local Optimization

This project is optimized for hyper-local search in Bengaluru:
- **Keywords**: BMTC bus route finder, Bangalore transit app, Namma Route, Bus timings Bangalore.
- **Structured Data**: Includes JSON-LD `WebApplication` schema for enhanced Google Search visibility.
- **Social**: Fully configured OpenGraph and Twitter Cards for professional sharing.

---

## 👨‍💻 Contact & Portfolio

Built with ❤️ for Bengaluru by **Megha**.

- **GitHub**: [Link to Profile](https://github.com/kanakmegha/)
- **Portfolio**: [kanak-megha-portfolio.vercel.app](https://kanak-megha-portfolio.vercel.app/)
- **Project Link**: [Namma Route on Vercel](https://blr-transport.vercel.app/)

---

*Disclaimer: This app uses estimated fare data and static GTFS schedules. Always verify with official BMTC announcements.*
