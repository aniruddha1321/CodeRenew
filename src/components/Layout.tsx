import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";

const Layout = () => {
  const [activeView, setActiveView] = useState("dashboard");
  const location = useLocation();


  React.useEffect(() => {
    const section = location.pathname.slice(1); // e.g., "upload"
    if (section) setActiveView(section);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
