import React from "react";
import { createRoot } from "react-dom/client";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./style.css";
import App from "./App";
import {initializePreferences} from './preferences';
initializePreferences();
createRoot(document.getElementById("root")!).render(<App />);
