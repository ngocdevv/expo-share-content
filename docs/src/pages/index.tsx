import React, {useEffect, useState} from 'react';
import Head from '@docusaurus/Head';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './index.module.css';

const INSTALL_COMMAND = 'npx expo install react-native-share-content';

const features = [
  {
    number: '01',
    title: 'Cold starts included',
    body: 'A durable pending queue keeps shared content available until JavaScript is ready and your app acknowledges it.',
    tag: 'No event loss',
  },
  {
    number: '02',
    title: 'Every attachment stays grouped',
    body: 'Text, URLs, images, video, audio, and files from one native share operation arrive as one typed payload.',
    tag: 'SEND_MULTIPLE',
  },
  {
    number: '03',
    title: 'Native setup, generated',
    body: 'The Expo config plugin creates Android intent filters and a native iOS Share Extension during prebuild.',
    tag: 'Idempotent plugin',
  },
  {
    number: '04',
    title: 'Files you can safely keep',
    body: 'Temporary provider data is copied into module-managed storage before the source app revokes access.',
    tag: 'Durable file:// URI',
  },
  {
    number: '05',
    title: 'Fast when warm, reliable when cold',
    body: 'Live listeners provide immediate delivery while pending APIs provide retryable, at-least-once processing.',
    tag: 'Events + queue',
  },
  {
    number: '06',
    title: 'Best-effort iOS return',
    body: 'Keep queue delivery independent of foregrounding. Opt into iosOpenHostAppAfterShare only when you want a best-effort return to the host app.',
    tag: 'iOS optional',
  },
];

const faqs = [
  {
    question: 'Does this work in Expo Go?',
    answer:
      'No. The package contains native Android code and an iOS Share Extension. Use an Expo development build or a production build after running prebuild.',
  },
  {
    question: 'Will an iOS share always open my app?',
    answer:
      'No. Queue delivery is reliable, but foregrounding the containing app is not guaranteed by iOS. Auto-open is opt-in and uses a best-effort open chain (UIApplication / responder-chain / NSExtensionContext.open).',
  },
  {
    question: 'Can the same payload appear twice?',
    answer:
      'Yes. Delivery is at least once. Pending queries and live events can expose the same stable payload ID, so application processing should be idempotent.',
  },
  {
    question: 'When can I delete received files?',
    answer:
      'Acknowledge the queue record after your import succeeds, then call releaseSharedFilesAsync for that receipt. Copy files into application-owned permanent storage first if you need to keep them.',
  },
  {
    question: 'Can I customize accepted content types?',
    answer:
      'Yes. Configure Android MIME filters, iOS activation rules, item limits, file-size limits, bundle identifiers, and App Group identifiers through the Expo config plugin.',
  },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m4 10 4 4 8-9" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

function InstallCommand({dark = false}: {dark?: boolean}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className={clsx(styles.installCommand, dark && styles.installCommandDark)}>
      <span aria-hidden="true">$</span>
      <code>{INSTALL_COMMAND}</code>
      <button type="button" onClick={copy} aria-label="Copy installation command">
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className={styles.copyStatus} aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}

function ShareFlow() {
  return (
    <div className={styles.shareFlow} aria-label="Shared content delivery flow">
      <div className={styles.flowGlow} />
      <div className={styles.sourceStack}>
        <div className={styles.sourceApp}>
          <img
            className={styles.sourceIcon}
            src="img/app-icon-photos.svg"
            alt=""
            width={40}
            height={40}
          />
          <span>Photos</span>
        </div>
        <div className={styles.sourceApp}>
          <img
            className={styles.sourceIcon}
            src="img/app-icon-safari.svg"
            alt=""
            width={40}
            height={40}
          />
          <span>Safari</span>
        </div>
        <div className={styles.sourceApp}>
          <img
            className={styles.sourceIcon}
            src="img/app-icon-files.svg"
            alt=""
            width={40}
            height={40}
          />
          <span>Files</span>
        </div>
      </div>

      <div className={styles.flowLine}>
        <span />
        <span />
        <span />
      </div>

      <div className={styles.queueCard}>
        <div className={styles.queueHeader}>
          <span className={styles.queueDot} />
          <span>Durable queue</span>
          <strong>3</strong>
        </div>
        <div className={styles.queueItem}>
          <span className={styles.itemIcon}>Aa</span>
          <div>
            <strong>Article URL</strong>
            <small>text / url</small>
          </div>
          <span className={styles.readyBadge}>ready</span>
        </div>
        <div className={styles.queueItem}>
          <span className={styles.itemIcon}>▧</span>
          <div>
            <strong>IMG_2481.HEIC</strong>
            <small>image · 2.8 MB</small>
          </div>
          <span className={styles.readyBadge}>ready</span>
        </div>
        <div className={styles.queueFooter}>
          <span>Cold start protected</span>
          <span className={styles.pulse} />
        </div>
      </div>

      <div className={styles.flowLineRight}>
        <span />
      </div>

      <div className={styles.phone}>
        <picture>
          <source srcSet="img/demo-share-received.webp" type="image/webp" />
          <img
            className={styles.phoneShot}
            src="img/demo-share-received.png"
            alt="Privacy-safe React Native Share Content demo showing an image payload with preview, filename, size, and App Group file URI"
            width={552}
            height={1200}
            decoding="async"
            loading="eager"
          />
        </picture>
      </div>
    </div>
  );
}

function CodeWindow() {
  return (
    <div className={styles.codeWindow}>
      <div className={styles.codeTitlebar}>
        <span />
        <span />
        <span />
        <p>ShareReceiver.tsx</p>
      </div>
      <pre>
        <code>
          <span className={styles.codePurple}>const</span> subscription ={' '}
          <span className={styles.codeBlue}>ExpoShareContent</span>
          {'.'}
          <span className={styles.codeYellow}>addShareListener</span>
          {'(async (payload) => {\n'}
          {'  '}
          <span className={styles.codePurple}>await</span> importShare(payload);{`\n\n`}
          {'  '}
          <span className={styles.codePurple}>await</span>{' '}
          <span className={styles.codeBlue}>ExpoShareContent</span>
          {'.'}
          <span className={styles.codeYellow}>clearPendingSharesAsync</span>
          {'([payload.id]);\n'}
          {'  '}
          <span className={styles.codePurple}>await</span>{' '}
          <span className={styles.codeBlue}>ExpoShareContent</span>
          {'.'}
          <span className={styles.codeYellow}>releaseSharedFilesAsync</span>
          {'([payload.id]);\n'}
          {'});'}
        </code>
      </pre>
      <div className={styles.codeResult}>
        <span className={styles.pulse} />
        <p>
          <strong>Live and pending delivery</strong>
          <small>One processing path, stable payload IDs</small>
        </p>
      </div>
    </div>
  );
}

export default function Home(): React.ReactNode {
  useEffect(() => {
    const url = new URL(window.location.href);
    const section = url.searchParams.get('section');
    if (!section) return;

    const target = document.getElementById(section);
    if (!target) return;

    target.scrollIntoView({behavior: 'smooth', block: 'start'});
    url.searchParams.delete('section');
    url.hash = section;
    window.history.replaceState({}, '', url);
  }, []);

  return (
    <Layout
      title="Receive shared content reliably"
      description="Receive text, URLs, images, video, audio, and files from the native share sheet in Expo apps. Cold starts included."
    >
      <Head>
        <meta property="og:type" content="website" />
      </Head>
      <main className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroBackdrop} />
          <div className={styles.container}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot} />
                Expo Modules · iOS · Android
              </div>
              <h1>
                Receive shared content.
                <span>Keep every item.</span>
              </h1>
              <p className={styles.heroDescription}>
                A typed Expo Module for receiving text, URLs, images, video, audio,
                and files from the native share sheet—with durable cold-start delivery.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} to="/docs/getting-started">
                  Get started <ArrowIcon />
                </Link>
                <Link
                  className={styles.secondaryButton}
                  href="https://github.com/ngocdevv/react-native-share-content"
                >
                  View on GitHub
                </Link>
              </div>
              <InstallCommand />
            </div>
            <ShareFlow />
          </div>
        </section>

        <section className={styles.contentStrip} aria-label="Supported content types">
          <div className={styles.container}>
            {['Text', 'URLs', 'Images', 'Video', 'Audio', 'Files'].map((item) => (
              <span key={item}>
                <CheckIcon /> {item}
              </span>
            ))}
          </div>
        </section>

        <section id="features" className={styles.featuresSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.sectionKicker}>Features & use cases</p>
              <h2>Built for the moment before your app is ready.</h2>
              <p>
                Native share flows start outside React Native. This module bridges that gap
                without making delivery depend on JavaScript startup timing.
              </p>
            </div>
            <div className={styles.featureGrid}>
              {features.map((feature) => (
                <article className={styles.featureCard} key={feature.number}>
                  <div className={styles.featureMeta}>
                    <span>/{feature.number}</span>
                    <small>{feature.tag}</small>
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <div className={styles.featureRule} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.architectureSection}>
          <div className={styles.container}>
            <div className={styles.architectureIntro}>
              <p className={styles.sectionKickerLight}>One durable path</p>
              <h2>From native share sheet to acknowledged import.</h2>
              <p>
                The config plugin creates platform integration. Native code owns the intake.
                Your JavaScript owns business processing and permanent retention.
              </p>
            </div>
            <div className={styles.architectureSteps}>
              <article>
                <span>01</span>
                <h3>Receive</h3>
                <p>Android intents and iOS extension items are normalized into one payload.</p>
              </article>
              <div className={styles.stepConnector} />
              <article>
                <span>02</span>
                <h3>Persist</h3>
                <p>Queue records and attachments survive a cold launch until JavaScript reads them.</p>
              </article>
              <div className={styles.stepConnector} />
              <article>
                <span>03</span>
                <h3>Acknowledge</h3>
                <p>Clear only after successful import, then release module-managed files explicitly.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="showcase" className={styles.showcaseSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeadingCentered}>
              <p className={styles.sectionKicker}>See what the API feels like</p>
              <h2>One handler for warm events and cold-start recovery.</h2>
            </div>
            <div className={styles.showcaseCard}>
              <div className={styles.showcaseCopy}>
                <span className={styles.showcaseLabel}>Retryable import flow</span>
                <h3>Process first. Acknowledge second.</h3>
                <p>
                  Keep the receipt pending while your import is in progress. If processing fails,
                  the queue remains available on the next launch.
                </p>
                <ul>
                  <li><CheckIcon /> Stable IDs for application-level deduplication</li>
                  <li><CheckIcon /> Attachment cleanup stays separate from acknowledgement</li>
                  <li><CheckIcon /> The same code works for live and pending payloads</li>
                </ul>
                <Link to="/docs/fundamentals/delivery-lifecycle">
                  Understand delivery semantics <ArrowIcon />
                </Link>
              </div>
              <CodeWindow />
            </div>
          </div>
        </section>

        <section className={styles.platformSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <p className={styles.sectionKicker}>Native where it matters</p>
              <h2>One JavaScript contract. Platform-correct integration.</h2>
            </div>
            <div className={styles.platformGrid}>
              <article>
                <div className={styles.platformIcon}>A</div>
                <p className={styles.platformName}>Android</p>
                <h3>Intents, lifecycle, durable copies.</h3>
                <p>
                  Receives ACTION_SEND and ACTION_SEND_MULTIPLE, including warm intents and
                  cold-launch delivery.
                </p>
                <Link to="/docs/platforms/android">Android guide <ArrowIcon /></Link>
              </article>
              <article>
                <div className={clsx(styles.platformIcon, styles.appleIcon)}>●</div>
                <p className={styles.platformName}>iOS</p>
                <h3>A real native Share Extension.</h3>
                <p>
                  Generates the target, App Group queue, entitlements, activation rules, and
                  extension source during prebuild.
                </p>
                <Link to="/docs/platforms/ios">iOS guide <ArrowIcon /></Link>
              </article>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.faqSection}>
          <div className={styles.container}>
            <div className={styles.faqLayout}>
              <div className={styles.faqIntro}>
                <p className={styles.sectionKicker}>FAQ</p>
                <h2>Before you prebuild.</h2>
                <p>
                  Native share integration has platform constraints. These are the important ones.
                </p>
              </div>
              <div className={styles.faqList}>
                {faqs.map((faq) => (
                  <details key={faq.question}>
                    <summary>{faq.question}<span>+</span></summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.ctaGlow} />
          <div className={styles.container}>
            <p className={styles.sectionKickerLight}>Start receiving</p>
            <h2>Make shared content a first-class app entry point.</h2>
            <p>Install the module, add the config plugin, then create a development build.</p>
            <InstallCommand dark />
            <Link className={styles.ctaButton} to="/docs/getting-started">
              Read the setup guide <ArrowIcon />
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
