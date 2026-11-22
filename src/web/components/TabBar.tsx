import { NavLink } from 'react-router-dom';

// Upcoming joins in Phase 3.
export default function TabBar() {
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Series</NavLink>
      <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}>Search</NavLink>
    </nav>
  );
}
