import { useEffect, useState } from 'react';
import { MortgagePage } from './MortgagePage';

function Home() {
  return <>
    <section className="home-hero">
      <h1>Financial planning tools</h1>
      <a className="button primary" href="/mortgage">Open mortgage calculator <span aria-hidden="true">↗</span></a>
      <div className="privacy-line"><span className="status-dot" /> Calculations run in your browser. Inputs are saved locally.</div>
    </section>
    <section className="tool-section" aria-labelledby="tools-heading">
      <div className="section-heading"><h2 id="tools-heading">Available tools</h2><span className="pill">01 tool available</span></div>
      <a className="tool-card" href="/mortgage">
        <span className="tool-icon" aria-hidden="true">⌂</span>
        <div><h3>Mortgage planner</h3><p>Monthly housing costs, amortization, and mortgage-interest tax savings.</p><span className="text-link">Open calculator <span aria-hidden="true">→</span></span></div>
      </a>
    </section>
  </>;
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  const isMortgage = path === '/mortgage' || path === '/mortgage/';
  useEffect(() => {
    document.title = isMortgage ? 'Mortgage planner | FinTech' : 'FinTech | Personal financial planning';
  }, [isMortgage]);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/" aria-label="FinTech home"><span className="brand-mark" aria-hidden="true">f.</span>FinTech<span className="brand-dot">.</span></a><nav aria-label="Main navigation"><a href="/" aria-current={path === '/' ? 'page' : undefined}>Overview</a><a href="/mortgage" aria-current={isMortgage ? 'page' : undefined}>Mortgage planner</a></nav></div></header>
    <main id="main" className="page-shell">{isMortgage ? <MortgagePage /> : path === '/' ? <Home /> : <section className="home-hero"><h1>Page not found.</h1><a href="/">Back to overview →</a></section>}</main>
    <footer className="site-footer"><span><strong>FinTech.</strong></span><span>USD · Planning estimates, not financial or tax advice.</span></footer>
  </>;
}