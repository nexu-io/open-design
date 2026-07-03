function Sidebar() {
  const items = ["Call", "Messages", "AI", "Device"];

  return (
    <nav className="g2-sidebar" aria-label="G2 HUD navigation">
      {items.map((item, index) => (
        <button className="g2-nav-button" aria-current={index === 0 ? "true" : undefined} key={item}>
          {item}
        </button>
      ))}
    </nav>
  );
}

window.Sidebar = Sidebar;
