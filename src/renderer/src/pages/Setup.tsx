import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { LLMProvider, ServerKind } from '@shared/types';
import { DEFAULT_MC_PORT, parseServerAddress } from '@shared/minecraft';
import { t } from '@shared/i18n';
import { LanguageSwitch } from '../components/ui';
import { providers, providerCredential, setProviderCredential } from './AiSettings';

const Choice: React.FC<{ selected: boolean; onSelect: () => void; title: string; detail: string }> = ({ selected, onSelect, title, detail }) => (
  <button type="button" onClick={onSelect} aria-pressed={selected} className={`choice items-center ${selected ? 'on' : ''}`}>
    <span
      className="w-4 h-4 shrink-0"
      style={
        selected
          ? { background: '#1557E6', boxShadow: 'inset 2px 2px 0 #4F84F0, inset -2px -2px 0 #0C3CA6' }
          : { background: '#DFE6F1', boxShadow: 'inset 2px 2px 0 #AEBBCF, inset -2px -2px 0 #FBFDFF' }
      }
      aria-hidden="true"
    />
    <span className="flex-1 min-w-0">
      <span className="block text-[15px] font-bold">{title}</span>
      <span className="block text-[13px] text-muted">{detail}</span>
    </span>
  </button>
);

export const Setup: React.FC = () => {
  const { settings, saveSettings, saveMinecraft } = useAppStore();
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<LLMProvider>(settings.activeDefaultProvider);
  const [credential, setCredential] = useState(providerCredential(settings, settings.activeDefaultProvider));
  const [kind, setKind] = useState<ServerKind>(settings.minecraft.kind);
  const [addresses, setAddresses] = useState<Record<ServerKind, string>>({ local: 'localhost:25565', public: '' });
  const [savedAddress, setSavedAddress] = useState('');

  const providerList = providers();
  const providerInfo = providerList.find(p => p.id === provider)!;
  const address = addresses[kind];

  const pickProvider = (id: LLMProvider) => {
    setProvider(id);
    setCredential(providerCredential(settings, id));
  };

  const saveServer = () => {
    const minecraft = settings.minecraft;
    const { host, port } = parseServerAddress(address);
    setSavedAddress(address.trim());
    saveMinecraft({
      ...minecraft,
      kind,
      targets: {
        ...minecraft.targets,
        [kind]: { ...minecraft.targets[kind], host, port: port ?? DEFAULT_MC_PORT }
      }
    });
  };

  const finish = () => {
    const next = setProviderCredential(settings, provider, credential);
    saveSettings({ ...next, activeDefaultProvider: provider, setupCompleted: true });
  };

  const heading = 'text-[30px] leading-tight font-bold';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="setup-art" />
        <div className="setup-shade" />
      </div>
      <div className="relative min-h-full flex items-center justify-center px-4 py-8">
        <main className="w-full max-w-[580px] px-9 py-7 bg-white/[.97] border border-white rounded-[18px] flex flex-col gap-5" style={{ boxShadow: '0 24px 60px rgba(15, 28, 51, 0.24)' }}>
          <div className="flex flex-wrap items-center gap-3">
            <img src="./assets/icons/logo_small.png" alt="" className="w-12 h-12 block" />
            <div className="flex-1 min-w-[200px]">
              <p className="font-pixel text-2xl leading-tight font-bold">MineOffice</p>
              <p className="text-sm text-muted">{t('app.tagline')}</p>
            </div>
            <LanguageSwitch />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-muted">{t('setup.step', { step: step + 1 })}</p>
            <div className="flex gap-1.5" aria-hidden="true">
              {[0, 1, 2].map(index => (
                <span key={index} className={`h-2 flex-1 ${index <= step ? 'bg-brand' : 'bg-line'}`} />
              ))}
            </div>
          </div>

          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className={heading}>{t('setup.brainTitle')}</h1>
                <p className="mt-1 text-[15px] text-muted">{t('setup.brainBody')}</p>
              </div>
              <div className="flex flex-col gap-2">
                {providerList.map(p => (
                  <Choice key={p.id} selected={provider === p.id} onSelect={() => pickProvider(p.id)} title={p.name} detail={p.note} />
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="setup-key" className="text-sm font-medium">
                  {provider === 'ollama' ? t('settings.ollamaAddress') : t('settings.apiKeyFor', { name: providerInfo.name })}
                </label>
                <input
                  id="setup-key"
                  className="field font-mono"
                  type={provider === 'ollama' ? 'text' : 'password'}
                  autoComplete="off"
                  value={credential}
                  onChange={e => setCredential(e.target.value)}
                  placeholder={providerInfo.hint}
                />
                <p className="text-[13px] text-muted">{t('setup.keyHint')}</p>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(1)} className="btn btn-primary">{t('setup.next')}</button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className={heading}>{t('setup.whereTitle')}</h1>
                <p className="mt-1 text-[15px] text-muted">{t('setup.whereBody')}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Choice selected={kind === 'local'} onSelect={() => setKind('local')} title={t('server.local')} detail={t('setup.localDetail')} />
                <Choice selected={kind === 'public'} onSelect={() => setKind('public')} title={t('server.public')} detail={t('setup.publicDetail')} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="setup-address" className="text-sm font-medium">{t('server.addressLabel')}</label>
                <input
                  id="setup-address"
                  className="field font-mono"
                  value={address}
                  onChange={e => setAddresses({ ...addresses, [kind]: e.target.value })}
                  placeholder={kind === 'local' ? 'localhost:25565' : 'play.example.com'}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button onClick={() => setStep(0)} className="btn btn-text">{t('setup.back')}</button>
                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} className="btn btn-ghost">{t('setup.skip')}</button>
                  <button onClick={() => { saveServer(); setStep(2); }} className="btn btn-primary">{t('setup.next')}</button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <h1 className={heading}>{t('setup.doneTitle')}</h1>
                <p className="mt-1 text-[15px] text-muted">{t('setup.doneBody')}</p>
              </div>
              <dl className="flex flex-col">
                <div className="flex flex-wrap justify-between gap-2 py-3 border-t" style={{ borderColor: '#E4EAF3' }}>
                  <dt className="text-sm text-muted">{t('setup.summaryBrain')}</dt>
                  <dd className="text-[15px] font-semibold">{providerInfo.name}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 py-3 border-t" style={{ borderColor: '#E4EAF3' }}>
                  <dt className="text-sm text-muted">{t('setup.summaryServer')}</dt>
                  <dd className="text-[15px] font-semibold font-mono break-all">{savedAddress || t('setup.notSet')}</dd>
                </div>
              </dl>
              {!credential && (
                <p className="px-3.5 py-3 rounded-lg bg-lantern-tint border border-lantern text-sm text-lantern-deep">
                  {t('setup.noKey')}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <button onClick={() => setStep(1)} className="btn btn-text">{t('setup.back')}</button>
                <button onClick={finish} className="btn btn-primary">{t('setup.enter')}</button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
