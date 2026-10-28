/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  serverTimestamp, 
  where,
  Timestamp,
  getDocFromServer,
  limit,
  getDocs
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Plus, 
  PlusCircle,
  Home,
  LogOut, 
  User as UserIcon, 
  ChevronRight, 
  Clock, 
  ShieldCheck, 
  CreditCard, 
  ArrowLeft,
  Filter,
  Gavel,
  ShoppingBag,
  CheckCircle2,
  X,
  History as HistoryIcon,
  MessageSquare,
  Star,
  Trash2,
  Edit,
  Edit3,
  Printer,
  FileText,
  Menu,
  ArrowUpRight,
  Heart,
  Tag,
  Check,
  Image as ImageIcon,
  Send,
  Loader2,
  Info,
  Sparkles,
  Settings,
  Package,
  LayoutGrid,
  Play,
  RefreshCw,
  Truck,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Share2,
  Copy
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

// --- Types ---
interface AuctionItem {
  id: string;
  title: string;
  description: string;
  price?: number;
  currentBid?: number;
  bidCount: number;
  listingType: 'auction' | 'buy-now';
  images: string[];
  sellerUid: string;
  sellerName: string;
  buyerUid?: string;
  endTime?: Timestamp;
  createdAt: Timestamp;
  status: 'active' | 'sold' | 'ended';
  category: 'Fine Art' | 'Timepieces' | 'Furniture' | 'Jewelry' | 'Manuscripts' | 'Other';
  lastBidderUid?: string;
  endingSoonEmailSent?: boolean;
  buyerDetails?: any;
  aiVideoUrl?: string;
  aiVideoPrompt?: string;
  orderStatus?: 'Payment Confirmed' | 'Processing' | 'Shipped' | 'Delivered';
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingLink?: string;
  orderStatusUpdatedAt?: string;
}

interface Review {
  id: string;
  itemId: string;
  reviewerUid: string;
  reviewerName: string;
  authenticityRating: number;
  conditionRating: number;
  sellerExperienceRating: number;
  comment?: string;
  timestamp: Timestamp;
}

interface Bid {
  id: string;
  itemId: string;
  bidderUid: string;
  bidderName: string;
  amount: number;
  timestamp: Timestamp;
}

interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'user' | 'admin';
  favorites?: string[];
  bio?: string;
  preferredCategories?: string[];
  externalCollectionUrl?: string;
  location?: string;
  createdAt?: Timestamp;
}

// --- Utils ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return new Error(JSON.stringify(errInfo));
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-primary/5 rounded-2xl", className)} />
);

// Helper to get milliseconds from a potential Firestore Timestamp or plain object
const getTimestampMillis = (timestamp: any): number => {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') return new Date(timestamp).getTime();
  return 0;
};

// Sample data for Demo Mode when quota is exceeded
const SAMPLE_ITEMS: AuctionItem[] = [
  {
    id: 'sample-1',
    title: 'Imperial Jade Dragon Seal',
    description: 'A magnificent jade seal from the Qianlong period, featuring intricate dragon carvings and imperial inscriptions.',
    category: 'Fine Art',
    price: 1250000,
    currentBid: 1450000,
    bidCount: 12,
    images: ['https://picsum.photos/seed/jade/800/1000'],
    status: 'active',
    listingType: 'auction',
    endTime: Timestamp.fromDate(new Date(Date.now() + 86400000)),
    createdAt: Timestamp.now(),
    sellerUid: 'system',
    sellerName: 'Strawboss Archives'
  },
  {
    id: 'sample-2',
    title: 'Renaissance Astrolabe',
    description: 'An exceptionally rare brass astrolabe, dated 1542, used for celestial navigation and timekeeping.',
    category: 'Other',
    price: 450000,
    currentBid: 450000,
    bidCount: 0,
    images: ['https://picsum.photos/seed/astrolabe/800/1000'],
    status: 'active',
    listingType: 'auction',
    endTime: Timestamp.fromDate(new Date(Date.now() + 172800000)),
    createdAt: Timestamp.now(),
    sellerUid: 'system',
    sellerName: 'Strawboss Archives'
  }
];

const ItemCardSkeleton = () => (
  <div className="bg-white border border-black/[0.03] overflow-hidden shadow-sm aspect-[4/5] flex flex-col">
    <div className="flex-1 bg-black/[0.03] animate-pulse" />
    <div className="p-8 space-y-4">
      <Skeleton className="h-2 w-1/4" />
      <Skeleton className="h-8 w-3/4" />
      <div className="pt-4 border-t border-black/[0.03] flex justify-between items-end">
        <div className="space-y-2">
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
    </div>
  </div>
);

const ReviewModal = ({ 
  item, 
  onCancel, 
  onSubmit 
}: { 
  item: AuctionItem, 
  onCancel: () => void, 
  onSubmit: (review: Omit<Review, 'id' | 'timestamp'>) => void 
}) => {
  const [ratings, setRatings] = useState({
    authenticity: 5,
    condition: 5,
    seller: 5
  });
  const [comment, setComment] = useState('');

  const StarRating = ({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-base font-black uppercase tracking-widest text-ink/80">{label}</span>
        <span className="text-accent font-serif italic">{value}/5</span>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onChange(star)}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
              star <= value ? "bg-accent text-white shadow-lg shadow-accent/20" : "bg-primary/[0.02] text-primary/10 hover:bg-primary/[0.05]"
            )}
          >
            <Star className={cn("w-4 h-4", star <= value && "fill-current")} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-primary/20 backdrop-blur-xl"
    >
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-surface w-full max-w-lg rounded-[2rem] md:rounded-[3rem] shadow-[0_80px_160px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh] p-8 md:p-12 space-y-8 md:space-y-12 border border-primary/5"
      >
        <div className="flex justify-between items-center border-b border-primary/5 pb-6 md:pb-8">
          <div className="space-y-1">
            <h3 className="text-2xl md:text-3xl font-serif font-black text-primary tracking-tighter uppercase">Artifact Review</h3>
            <p className="text-sm md:text-base font-black text-accent uppercase tracking-widest">{item.title}</p>
          </div>
          <button onClick={onCancel} className="text-primary/20 hover:text-accent transition-colors">
            <X className="w-6 h-6 md:w-8 md:h-8" />
          </button>
        </div>

        <div className="space-y-8 md:space-y-10">
          <StarRating 
            label="Authenticity Verification" 
            value={ratings.authenticity} 
            onChange={(v) => setRatings({...ratings, authenticity: v})} 
          />
          <StarRating 
            label="Artifact Condition" 
            value={ratings.condition} 
            onChange={(v) => setRatings({...ratings, condition: v})} 
          />
          <StarRating 
            label="Seller Experience" 
            value={ratings.seller} 
            onChange={(v) => setRatings({...ratings, seller: v})} 
          />

          <div className="space-y-3">
            <label className="text-sm md:text-base font-black uppercase tracking-widest text-ink/80 ml-4">Detailed Feedback (Optional)</label>
            <textarea 
              rows={3}
              className="w-full bg-primary/[0.02] border border-primary/5 rounded-2xl py-4 md:py-5 px-6 md:px-8 outline-none focus:border-accent transition-all resize-none text-primary font-serif italic text-sm md:text-base"
              placeholder="Share your thoughts on this acquisition..."
              value={comment}
              onChange={e => setComment(e.target.value)}
            />
          </div>

          <motion.button 
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSubmit({
              itemId: item.id,
              reviewerUid: '', // Will be set in parent
              reviewerName: '', // Will be set in parent
              authenticityRating: ratings.authenticity,
              conditionRating: ratings.condition,
              sellerExperienceRating: ratings.seller,
              comment,
            })}
            className="w-full bg-primary text-white py-6 md:py-8 rounded-2xl text-sm md:text-base font-black tracking-[0.4em] uppercase hover:bg-accent transition-all duration-700 shadow-[0_40px_80px_rgba(0,31,63,0.2)]"
          >
            Submit Review
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const MembershipModal = ({ onCancel, onSubmit }: { onCancel: () => void, onSubmit: (data: any) => void }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    collectionSize: '1-10',
    interest: 'Fine Art',
    message: ''
  });

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-primary/60 backdrop-blur-2xl p-4 md:p-6"
    >
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-surface w-full max-w-2xl rounded-[2.5rem] md:rounded-[4rem] shadow-[0_80px_160px_rgba(0,0,0,0.6)] overflow-y-auto max-h-[90vh] border border-white/10 p-8 md:p-16 space-y-8 md:space-y-12 relative"
      >
        <button onClick={onCancel} className="absolute top-6 right-6 md:top-12 md:right-12 text-primary/20 hover:text-primary transition-colors">
          <X className="w-6 h-6 md:w-8 md:h-8" />
        </button>

        <div className="space-y-4 md:space-y-6 text-center">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 md:mb-8">
            <ShieldCheck className="w-8 h-8 md:w-10 md:h-10 text-accent" />
          </div>
          <h3 className="text-2xl font-serif font-black text-primary tracking-tighter">THE GILDED CIRCLE</h3>
          <p className="text-ink/80 font-light italic text-base md:text-lg">Apply for exclusive access to the world's most prestigious antiquities collection.</p>
        </div>

        <div className="space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-3">
              <label className="text-base uppercase tracking-[0.4em] font-black text-accent">Full Name</label>
              <input 
                className="input-field" 
                placeholder="Your Name"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="space-y-3">
              <label className="text-base uppercase tracking-[0.4em] font-black text-accent">Email Address</label>
              <input 
                className="input-field" 
                placeholder="Email"
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-3">
              <label className="text-base uppercase tracking-[0.4em] font-black text-accent">Collection Size</label>
              <select 
                className="w-full bg-transparent border-b border-primary/10 py-4 md:py-6 outline-none focus:border-accent font-serif text-lg md:text-xl italic text-primary"
                value={formData.collectionSize}
                onChange={e => setFormData({...formData, collectionSize: e.target.value})}
              >
                <option value="1-10">1-10 Items</option>
                <option value="11-50">11-50 Items</option>
                <option value="50+">50+ Items</option>
              </select>
            </div>
            <div className="space-y-3">
              <label className="text-base uppercase tracking-[0.4em] font-black text-accent">Primary Interest</label>
              <select 
                className="w-full bg-transparent border-b border-primary/10 py-4 md:py-6 outline-none focus:border-accent font-serif text-lg md:text-xl italic text-primary"
                value={formData.interest}
                onChange={e => setFormData({...formData, interest: e.target.value})}
              >
                <option value="Fine Art">Fine Art</option>
                <option value="Timepieces">Timepieces</option>
                <option value="Furniture">Furniture</option>
                <option value="Jewelry">Jewelry</option>
                <option value="Manuscripts">Manuscripts</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-base uppercase tracking-[0.4em] font-black text-accent">Personal Note</label>
            <textarea 
              className="input-field min-h-[100px] resize-none" 
              placeholder="Why would you like to join?"
              value={formData.message}
              onChange={e => setFormData({...formData, message: e.target.value})}
            />
          </div>

          <motion.button 
            whileHover={{ scale: 1.02, y: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSubmit(formData)}
            className="w-full bg-primary text-white py-8 rounded-none text-base font-black tracking-[0.6em] uppercase shadow-2xl hover:bg-accent transition-all duration-700"
          >
            SUBMIT APPLICATION
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const ChatWindow = ({ onClose }: { onClose: () => void }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, text: "Welcome to Strawboss Elite Support. How may we assist your collection journey today?", sender: 'agent' }
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;
    const newMsg = { id: Date.now(), text: message, sender: 'user' };
    setMessages([...messages, newMsg]);
    setMessage('');
    
    // Simulate agent response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        id: Date.now() + 1, 
        text: "An elite curator has been notified. We will respond to your inquiry momentarily.", 
        sender: 'agent' 
      }]);
    }, 1500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 100, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 100, scale: 0.8 }}
      className="fixed bottom-4 right-4 md:bottom-32 md:right-8 z-[100] w-[calc(100%-2rem)] md:w-[450px] h-[500px] md:h-[650px] bg-surface rounded-[2rem] md:rounded-[3rem] shadow-[0_50px_100px_rgba(0,0,0,0.5)] border border-primary/5 flex flex-col overflow-hidden"
    >
      <div className="bg-primary p-6 md:p-10 text-white flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="w-10 h-10 md:w-14 md:h-14 bg-accent rounded-full flex items-center justify-center">
            <UserIcon className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </div>
          <div>
            <h4 className="text-lg md:text-xl font-serif font-black tracking-tight">Elite Concierge</h4>
            <p className="text-base uppercase tracking-widest text-white/90 font-black">Always Online</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
          <X className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 p-6 md:p-10 overflow-y-auto space-y-6 md:space-y-8 bg-surface/30">
        {messages.map(msg => (
          <motion.div 
            key={msg.id}
            initial={{ opacity: 0, x: msg.sender === 'user' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-6 rounded-[2rem] text-base font-light leading-relaxed ${msg.sender === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-surface text-primary rounded-tl-none shadow-xl border border-primary/5'}`}>
              {msg.text}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-8 bg-surface border-t border-primary/5 flex gap-4">
        <input 
          className="flex-1 bg-surface py-5 px-8 rounded-full outline-none focus:ring-2 focus:ring-accent/20 transition-all font-serif italic text-base"
          placeholder="Inquire about an artifact..."
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
        />
        <button 
          onClick={handleSend}
          className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center hover:bg-accent transition-all duration-500 shadow-xl"
        >
          <Send className="w-6 h-6" />
        </button>
      </div>
    </motion.div>
  );
};

const LazyImage = ({ src, alt, className, imgClassName, loading = "lazy", ...props }: { src: string, alt: string, className?: string, imgClassName?: string, loading?: "lazy" | "eager", [key: string]: any }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setIsLoaded(true);
    } else {
      setIsLoaded(false);
    }
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-primary/5 animate-pulse flex items-center justify-center z-10">
          <div className="w-8 h-8 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
        </div>
      )}
      <img
        key={src}
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setIsLoaded(true)}
        onError={() => setIsLoaded(true)}
        className={`w-full h-full ${imgClassName || 'object-cover'}`}
        referrerPolicy="no-referrer"
        {...props}
      />
    </div>
  );
};

const MobileBottomNav = ({ 
  view, 
  setView, 
  favoritesCount,
  user,
  isAdmin
}: { 
  view: string, 
  setView: (v: string) => void, 
  favoritesCount: number,
  user: any,
  isAdmin: boolean
}) => {
  const navItems = [
    { name: 'Home', icon: Home, view: 'home' },
    { name: 'Archives', icon: Search, view: 'marketplace' },
    { name: 'Consign', icon: PlusCircle, view: 'sell' },
    { name: 'Watchlist', icon: Heart, view: 'dashboard', count: favoritesCount },
    { name: 'Profile', icon: UserIcon, view: 'dashboard' },
    ...(isAdmin ? [{ name: 'Admin', icon: Settings, view: 'admin' }] : [])
  ];

  return (
    <motion.div 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-black/5 px-6 py-4 z-[100] flex justify-between items-center safe-area-pb"
    >
      {navItems.map((item) => {
        const isActive = view === item.view;
        const Icon = item.icon;
        return (
          <button
            key={item.name}
            onClick={() => setView(item.view)}
            className="flex flex-col items-center gap-1 relative group"
          >
            <div className={cn(
              "p-2 rounded-2xl transition-all duration-300",
              isActive ? "bg-primary text-white scale-110 shadow-lg" : "text-zinc-400"
            )}>
              <Icon className="w-5 h-5" />
              {item.count !== undefined && item.count > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white">
                  {item.count}
                </span>
              )}
            </div>
            <span className={cn(
              "text-[8px] font-black uppercase tracking-widest transition-colors",
              isActive ? "text-primary" : "text-zinc-400"
            )}>
              {item.name}
            </span>
          </button>
        );
      })}
    </motion.div>
  );
};

const Navbar = ({ 
  user, 
  userProfile,
  isAdmin,
  onSignIn, 
  onSignOut, 
  setView, 
  favoritesCount, 
  view,
  searchQuery,
  setSearchQuery,
  searchHistory,
  showHistory,
  setShowHistory,
  onAboutClick,
  onMembershipClick,
  featuredImageUrl
}: { 
  user: User | null, 
  userProfile: UserProfile | null,
  isAdmin: boolean,
  onSignIn: () => void, 
  onSignOut: () => void, 
  setView: (v: string) => void, 
  favoritesCount: number, 
  view: string,
  searchQuery: string,
  setSearchQuery: (q: string) => void,
  searchHistory: string[],
  showHistory: boolean,
  setShowHistory: (s: boolean) => void,
  onAboutClick: () => void,
  onMembershipClick: () => void,
  featuredImageUrl: string
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);

  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== searchQuery) {
        setSearchQuery(inputValue);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue, searchQuery, setSearchQuery]);

  return (
    <motion.header 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 left-0 right-0 z-[100] bg-[#faf8f5]/95 backdrop-blur-md border-b border-stone-200/80"
    >
      {/* Curatorial Utility Strip */}
      <div className="bg-[#171513] text-[#e7e5e4] py-1.5 px-4 md:px-12 text-[10px] font-sans font-medium uppercase tracking-[0.25em] flex justify-between items-center border-b border-stone-800">
        <span className="flex items-center gap-2">
          <span className="text-stone-400">STRAWBOSS ARCHIVES</span>
          <span className="text-stone-600">·</span>
          <span className="hidden sm:inline text-stone-300">EST. 1992</span>
          <span className="hidden md:inline text-stone-600">·</span>
          <span className="hidden md:inline text-stone-400">LONDON · NEW YORK · GENEVA</span>
        </span>
        <span className="flex items-center gap-4 text-stone-300">
          <span className="hidden lg:inline text-[9px] text-stone-400">AUTHENTICATED PROVENANCE GUARANTEED</span>
          <span className="flex items-center gap-1.5 text-amber-400/90">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[9px] tracking-widest font-semibold">LIVE AUCTION DESK</span>
          </span>
        </span>
      </div>

      <nav className="max-w-[1800px] mx-auto px-4 md:px-12 h-16 md:h-20 flex items-center justify-between gap-6">
        {/* Zone 1: Wordmark */}
        <div 
          className="flex items-center gap-3 cursor-pointer group flex-shrink-0"
          onClick={() => setView('home')}
        >
          <div className="w-9 h-9 md:w-11 md:h-11 rounded-full overflow-hidden border border-stone-300 shadow-sm group-hover:border-stone-900 transition-colors">
            <LazyImage 
              src={featuredImageUrl} 
              alt="Logo" 
              imgClassName="object-cover"
              loading="eager"
            />
          </div>
          <div className="flex flex-col">
            <span className="text-xl md:text-2xl font-serif font-semibold tracking-wider text-stone-900 leading-none">
              STRAWBOSS
            </span>
            <span className="text-[9px] font-sans tracking-[0.3em] uppercase text-stone-500 font-medium mt-0.5">
              Archives & Auctions
            </span>
          </div>
        </div>

        {/* Zone 2: Curated Nav Links */}
        <div className="hidden lg:flex items-center gap-7 text-[11px] font-sans uppercase tracking-[0.18em] text-stone-600">
          {[
            { name: 'Live Auctions', view: 'marketplace' },
            { name: 'Private Treaty', view: 'marketplace' },
            { name: 'Consign Artifact', view: 'sell' },
            { name: 'Monograph & Provenance', view: 'about' },
            ...(isAdmin ? [{ name: 'Curator Desk', view: 'admin' }] : [])
          ].map((item) => (
            <button 
              key={item.name}
              onClick={() => setView(item.view)}
              className={cn(
                "hover:text-stone-950 transition-colors py-1 relative whitespace-nowrap font-medium",
                view === item.view ? "text-stone-950 font-semibold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1.5px] after:bg-stone-900" : "text-stone-600"
              )}
            >
              {item.name}
            </button>
          ))}
        </div>

        {/* Search Input - Desktop */}
        <div className="hidden xl:flex items-center flex-1 max-w-sm mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search catalog, era, medium..."
              className="w-full bg-white/70 border border-stone-300/80 rounded-none py-2 pl-9 pr-3 text-xs font-sans placeholder:text-stone-400 outline-none focus:bg-white focus:border-stone-800 transition-all"
            />
          </div>
        </div>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-3 md:gap-5 flex-shrink-0">
          {/* Mobile search toggle / simple input */}
          <div className="xl:hidden w-32 sm:w-48 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-stone-400 pointer-events-none" />
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search..."
              className="w-full bg-white/80 border border-stone-300 rounded-none py-1.5 pl-7 pr-2 text-[11px] font-sans outline-none focus:border-stone-800"
            />
          </div>

          <button 
            onClick={() => setView('dashboard')}
            className="p-2 text-stone-600 hover:text-stone-950 transition-colors relative"
            title="Watchlist"
          >
            <Heart className={cn("w-4.5 h-4.5", favoritesCount > 0 ? "fill-stone-900 text-stone-900" : "text-stone-600")} />
            {favoritesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-stone-900 text-stone-50 text-[9px] font-sans font-bold flex items-center justify-center">
                {favoritesCount}
              </span>
            )}
          </button>

          <div className="hidden md:flex items-center">
            {user ? (
              <button 
                onClick={() => setView('dashboard')}
                className="flex items-center gap-2.5 border border-stone-300/80 bg-white/80 px-3.5 py-1.5 hover:border-stone-800 transition-colors group"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden border border-stone-200">
                  <img 
                    src={userProfile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[11px] font-sans font-medium text-stone-800 group-hover:text-stone-950 uppercase tracking-wider">
                  {userProfile?.displayName?.split(' ')[0] || 'Collector'}
                </span>
              </button>
            ) : (
              <button 
                onClick={onSignIn}
                className="btn-primary !py-2.5 !px-5 !text-[10px]"
              >
                Member Sign In
              </button>
            )}
          </div>

          <button 
            className="lg:hidden p-2 text-stone-800 hover:text-stone-950 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: '-100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="lg:hidden fixed inset-0 bg-white z-[150] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 h-20 border-b border-black/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-black/5">
                  <img src={featuredImageUrl} alt="Logo" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-xl font-black tracking-tighter uppercase leading-none text-black">Strawboss</h1>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-black"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-12">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6">Navigation</p>
                {[
                  { name: 'Antiques', view: 'marketplace' },
                  { name: 'Collection', view: 'marketplace' },
                  { name: 'Live Auctions', view: 'marketplace' },
                  { name: 'Catalogues', view: 'marketplace' },
                  { name: 'New Acquisitions', view: 'marketplace' },
                  ...(user ? [{ name: 'My Profile', view: 'dashboard' }] : []),
                  ...(isAdmin ? [{ name: 'Admin Panel', view: 'admin' }] : [])
                ].map((item, i) => (
                  <motion.button 
                    key={item.name}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => {
                      setView(item.view);
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left text-3xl font-serif font-black uppercase tracking-tighter text-black hover:text-accent transition-all py-2"
                  >
                    {item.name}
                  </motion.button>
                ))}
              </div>

              <div className="space-y-6 pt-8 border-t border-black/5">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Search Catalog</p>
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input 
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Search archives..."
                    className="w-full bg-zinc-50 border border-black/5 rounded-full py-4 pl-12 pr-4 text-sm font-bold tracking-widest outline-none focus:bg-white focus:border-black/20 transition-all"
                  />
                </div>
              </div>

              {!user && (
                <button 
                  onClick={() => {
                    onSignIn();
                    setIsMobileMenuOpen(false);
                  }}
                  className="w-full btn-primary py-6 text-base"
                >
                  Member Access
                </button>
              )}
            </div>

            <div className="p-8 bg-zinc-50 border-t border-black/5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 text-center">
                Est. 1992 | Strawboss Archives
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

const Hero = ({ onExplore, onConsign, featuredImageUrl, loading, isAdmin }: { onExplore: () => void, onConsign: () => void, featuredImageUrl: string, loading?: boolean, isAdmin?: boolean }) => {
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 20;
    const rotateY = (centerX - x) / 20;
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  return (
    <section className="relative min-h-[92vh] bg-[#faf8f5] overflow-hidden flex items-center border-b border-stone-200">
      {/* Archival Paper Texture and Hairline Grid */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none">
        <LazyImage 
          src={featuredImageUrl} 
          alt="Hero Background" 
          className="w-full h-full object-cover scale-105 filter grayscale contrast-125"
        />
      </div>
      <div 
        className="absolute inset-0 opacity-[0.035] pointer-events-none" 
        style={{ 
          backgroundImage: 'linear-gradient(to right, #171513 1px, transparent 1px), linear-gradient(to bottom, #171513 1px, transparent 1px)', 
          backgroundSize: '48px 48px' 
        }} 
      />
      
      <div className="max-w-[1700px] mx-auto px-6 md:px-12 w-full grid lg:grid-cols-[1.15fr_0.85fr] gap-12 lg:gap-20 items-center pt-32 md:pt-36 pb-20 md:pb-28 relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-left space-y-8 md:space-y-10"
        >
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="w-8 h-[1px] bg-amber-800" />
              <span className="text-amber-900 text-xs font-sans font-semibold tracking-[0.25em] uppercase">
                ESTATE ARCHIVES · VOLUME XXXIV
              </span>
            </div>
            
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-normal text-stone-900 leading-[1.04] tracking-tight">
              The Architecture of <br />
              <span className="italic font-normal text-stone-700">Historical Provenance</span>
            </h1>

            <p className="text-base sm:text-lg font-serif italic text-stone-600 max-w-xl leading-relaxed pt-2">
              Established 1992. The global authority for authenticated antique auctions, private treaty treaties, and white-glove estate curation.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <button 
              onClick={onExplore}
              className="btn-primary !px-9 !py-4 text-xs font-sans tracking-[0.2em]"
            >
              Explore Active Catalogues
            </button>
            <button 
              onClick={onConsign}
              className="btn-outline !px-9 !py-4 text-xs font-sans tracking-[0.2em] bg-white/60"
            >
              Consign an Artifact
            </button>
          </div>

          {/* Institutional Ledger Metric Strip */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-stone-200 max-w-xl">
            <div className="space-y-0.5">
              <span className="text-2xl sm:text-3xl font-serif font-medium text-stone-900 tabular-nums">99.8%</span>
              <p className="text-[10px] uppercase tracking-[0.2em] font-sans font-medium text-stone-500">Certified Provenance</p>
            </div>
            <div className="space-y-0.5 border-l border-stone-200 pl-6">
              <span className="text-2xl sm:text-3xl font-serif font-medium text-stone-900 tabular-nums">12,400+</span>
              <p className="text-[10px] uppercase tracking-[0.2em] font-sans font-medium text-stone-500">Vetted Collectors</p>
            </div>
            <div className="space-y-0.5 border-l border-stone-200 pl-6">
              <span className="text-2xl sm:text-3xl font-serif font-medium text-stone-900 tabular-nums">$4.2B</span>
              <p className="text-[10px] uppercase tracking-[0.2em] font-sans font-medium text-stone-500">Curated Valuations</p>
            </div>
          </div>
        </motion.div>

        {/* Featured Lot Catalogue Presentation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:block"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="relative bg-white border border-stone-300/80 shadow-[0_24px_50px_-15px_rgba(23,21,19,0.08)] max-w-md mx-auto p-6 space-y-5">
            {/* Museum Catalog Tag Header */}
            <div className="flex justify-between items-baseline border-b border-stone-200 pb-3 text-[10px] font-sans uppercase tracking-[0.2em] text-stone-500">
              <span className="text-stone-900 font-semibold">LOT NO. 402</span>
              <span>LIVE BIDDING ACTIVE</span>
            </div>

            {/* Artwork Frame */}
            <div className="relative aspect-[4/5] overflow-hidden bg-[#f4f2ee] flex items-center justify-center border border-stone-200/60 p-4">
              <LazyImage 
                src={featuredImageUrl} 
                alt="Featured Lot" 
                imgClassName="max-h-full max-w-full object-contain shadow-md"
              />
            </div>

            {/* Artwork Metadata */}
            <div className="space-y-2 pt-1">
              <span className="text-[9px] uppercase tracking-[0.25em] text-amber-800 font-semibold block">
                FINE ART & ANTIQUITIES
              </span>
              <h2 className="text-xl font-serif font-medium text-stone-900 leading-snug">
                Imperial Ming Dynasty Cobalt Vase
              </h2>
              <p className="text-xs font-serif italic text-stone-500">
                Jingdezhen Imperial Kilns, Xuande Period (1426–1435). Underglaze blue porcelain.
              </p>
            </div>

            {/* Bidding Summary */}
            <div className="pt-3 border-t border-stone-200 flex items-center justify-between">
              <div>
                <span className="text-[9px] uppercase tracking-widest text-stone-400 block font-sans">Current Valuation</span>
                <span className="text-2xl font-serif font-medium text-stone-900 tabular-nums">$850,000 USD</span>
              </div>
              <button 
                onClick={onExplore}
                className="btn-primary !px-5 !py-2.5 text-[10px] font-sans tracking-[0.18em]"
              >
                Place Bid
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

const CountdownTimer = ({ endTime }: { endTime: Timestamp }) => {
  const [timeLeft, setTimeLeft] = useState<{ d: number, h: number, m: number, s: number } | null>(null);

  useEffect(() => {
    const calculate = () => {
      if (!endTime) return;
      const now = Date.now();
      const end = getTimestampMillis(endTime);
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      setTimeLeft({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff / (1000 * 60 * 60)) % 24),
        m: Math.floor((diff / 1000 / 60) % 60),
        s: Math.floor((diff / 1000) % 60)
      });
    };

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [endTime]);

  if (!timeLeft) return <span className="text-accent">Auction Ended</span>;

  return (
    <div className="flex gap-2 text-[10px] font-black uppercase tracking-widest text-white">
      <div className="flex flex-col items-center bg-primary/40 backdrop-blur-md px-2 py-1 rounded-lg min-w-[30px]">
        <span>{timeLeft.d}</span>
        <span className="text-[6px] opacity-60">Days</span>
      </div>
      <div className="flex flex-col items-center bg-primary/40 backdrop-blur-md px-2 py-1 rounded-lg min-w-[30px]">
        <span>{timeLeft.h}</span>
        <span className="text-[6px] opacity-60">Hrs</span>
      </div>
      <div className="flex flex-col items-center bg-primary/40 backdrop-blur-md px-2 py-1 rounded-lg min-w-[30px]">
        <span>{timeLeft.m}</span>
        <span className="text-[6px] opacity-60">Min</span>
      </div>
      <div className="flex flex-col items-center bg-accent backdrop-blur-md px-2 py-1 rounded-lg min-w-[30px]">
        <span>{timeLeft.s}</span>
        <span className="text-[6px] opacity-60">Sec</span>
      </div>
    </div>
  );
};

const ItemCard = ({ 
  item, 
  onClick, 
  isFavorite, 
  onToggleFavorite, 
  onEdit,
  isSelectedForPrint,
  onTogglePrint
}: { 
  item: AuctionItem, 
  onClick: () => void, 
  isFavorite: boolean, 
  onToggleFavorite: (e: React.MouseEvent) => void, 
  onEdit?: (e: React.MouseEvent) => void,
  isSelectedForPrint?: boolean,
  onTogglePrint?: (e: React.MouseEvent) => void
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="group relative bg-white border border-stone-200/90 hover:border-stone-400 overflow-hidden cursor-pointer shadow-none hover:shadow-[0_20px_40px_-15px_rgba(23,21,19,0.07)] transition-all duration-400 rounded-none flex flex-col"
      onClick={onClick}
    >
      {/* Artwork Exhibition Frame */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[#f6f4f0] flex items-center justify-center p-3">
        <LazyImage 
          src={(item.images && item.images[0]) || `https://picsum.photos/seed/item-${item.id}/800/1000`} 
          alt={item.title}
          imgClassName={cn(
            "max-w-full max-h-full object-contain transition-transform duration-700 ease-out",
            isHovered ? "scale-105" : "scale-100"
          )}
        />

        {/* Minimal Action Controls */}
        <div className="absolute top-3.5 right-3.5 z-20 flex flex-col gap-2">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(e);
            }}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm",
              isFavorite 
                ? "bg-stone-900 text-stone-50" 
                : "bg-white/85 hover:bg-white text-stone-700 backdrop-blur-sm border border-stone-200"
            )}
            title={isFavorite ? "Remove from watchlist" : "Add to watchlist"}
          >
            <Heart className={cn("w-3.5 h-3.5", isFavorite && "fill-current")} />
          </motion.button>

          {onTogglePrint && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePrint(e);
              }}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm",
                isSelectedForPrint 
                  ? "bg-amber-900 text-stone-50" 
                  : "bg-white/85 hover:bg-white text-stone-700 backdrop-blur-sm border border-stone-200"
              )}
              title="Add to Curated Print Catalog"
            >
              <Printer className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Accession Details Block */}
      <div className="p-4 sm:p-5 md:p-6 space-y-3 bg-white flex-1 flex flex-col justify-between border-t border-stone-100">
        <div className="space-y-1.5">
          {/* Unboxed Metadata Kicker (Zero-Pill Discipline) */}
          <div className="flex items-center gap-1.5 text-[9px] font-sans uppercase tracking-[0.2em] text-stone-500">
            <span>LOT {item.id.slice(-4).toUpperCase()}</span>
            <span>·</span>
            <span className="text-stone-700 font-medium">{item.category}</span>
            <span>·</span>
            <span className={item.listingType === 'auction' ? "text-amber-800 font-semibold" : "text-stone-500"}>
              {item.listingType === 'auction' ? 'LIVE BID' : 'PRIVATE TREATY'}
            </span>
          </div>

          <h3 className="text-sm sm:text-base md:text-lg font-serif font-medium text-stone-900 leading-snug group-hover:text-amber-900 transition-colors line-clamp-1">
            {item.title}
          </h3>
        </div>

        {/* Valuation and Bid Ledger */}
        <div className="flex justify-between items-baseline pt-3 border-t border-stone-100">
          <div className="space-y-0.5">
            <span className="text-[8px] sm:text-[9px] font-sans uppercase tracking-[0.2em] text-stone-400 block font-medium">
              {item.listingType === 'auction' ? 'Current Bid' : 'Asking Price'}
            </span>
            <span className="text-base sm:text-lg md:text-xl font-serif font-medium text-stone-900 tabular-nums">
              ${(item.listingType === 'auction' ? (item.currentBid || item.price) : item.price)?.toLocaleString()} <span className="text-[10px] font-sans text-stone-400 font-normal">USD</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {item.listingType === 'auction' && (
              <span className="text-[9px] font-sans tracking-wider text-stone-500 font-medium">
                {item.bidCount} {item.bidCount === 1 ? 'bid' : 'bids'}
              </span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        {onEdit && (
          <button 
            onClick={onEdit}
            className="absolute top-3 left-3 w-7 h-7 bg-stone-900 text-white flex items-center justify-center shadow-md hover:scale-105 transition-transform"
            title="Edit listing"
          >
            <Edit3 className="w-3 h-3" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

const MembershipSection = ({ onApply }: { onApply: () => void }) => (
  <section id="membership" className="relative py-24 md:py-60 px-4 md:px-12 bg-primary overflow-hidden">
    {/* Atmospheric Background */}
    <div className="absolute inset-0 opacity-20 pointer-events-none">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_30%,_var(--color-accent)_0%,_transparent_50%)] blur-[120px]" />
      <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_70%_70%,_var(--color-accent)_0%,_transparent_50%)] blur-[120px]" />
    </div>

    <div className="max-w-[1800px] mx-auto relative z-10">
      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-16 md:gap-32 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-12 md:space-y-16"
        >
          <div className="space-y-6 md:space-y-8">
            <div className="flex items-center gap-4">
              <span className="w-12 h-[1px] bg-accent" />
              <span className="text-accent text-base font-black tracking-[0.6em] uppercase">Private Membership</span>
            </div>
            <h3 className="text-3xl font-serif font-black text-white leading-[0.9] md:leading-[0.8] tracking-tighter uppercase">
              The Elite <br />
              <span className="italic font-extralight text-white/70 lowercase">circle</span>
            </h3>
            <p className="text-base md:text-lg font-serif italic text-white/90 max-w-xl leading-relaxed">
              Join an exclusive community of the world's most discerning collectors. Gain early access to private auctions, early previews, and white-glove concierge services.
            </p>
          </div>

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
            {[
              "Early Access to High-Value Auctions",
              "Dedicated Personal Curator",
              "Complimentary Authentication Reports",
              "Private Viewing Room Access"
            ].map((feature, i) => (
              <motion.li 
                key={feature}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 1 }}
                className="flex items-center gap-4 md:gap-6 text-base font-black uppercase tracking-[0.3em] text-white/80"
              >
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-accent/10 flex items-center justify-center border border-accent/20 flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-accent" />
                </div>
                {feature}
              </motion.li>
            ))}
          </ul>

          <motion.button 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={onApply}
            className="w-full sm:w-auto bg-accent text-white px-12 md:px-16 py-6 md:py-8 text-base font-black tracking-[0.6em] uppercase hover:bg-white hover:text-primary transition-all duration-700 shadow-[0_40px_80px_rgba(242,125,38,0.3)]"
          >
            Apply for Membership
          </motion.button>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
          className="relative perspective-[2000px]"
        >
          <motion.div 
            whileHover={{ rotateY: 15, rotateX: -5 }}
            transition={{ type: 'spring', stiffness: 100, damping: 30 }}
            className="aspect-square md:aspect-square bg-white/5 border border-white/10 rounded-[3rem] md:rounded-[5rem] p-10 md:p-20 backdrop-blur-3xl flex flex-col justify-center items-center text-center space-y-12 md:space-y-16 group hover:border-accent/30 transition-all duration-1000 shadow-[0_100px_200px_rgba(0,0,0,0.5)]"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
              <div className="w-24 h-24 md:w-40 md:h-40 bg-accent/10 rounded-full flex items-center justify-center border border-accent/20 relative z-10 group-hover:rotate-[360deg] transition-transform duration-[2s]">
                <ShieldCheck className="w-12 h-12 md:w-20 md:h-20 text-accent" />
              </div>
            </div>
            
            <div className="space-y-4 md:space-y-6">
              <h3 className="text-2xl font-serif font-black text-white tracking-tighter uppercase">Elite Verification</h3>
              <p className="text-white/70 font-serif italic text-base md:text-lg leading-relaxed max-w-xs mx-auto">
                Every member undergoes a rigorous vetting process to ensure the integrity of our marketplace.
              </p>
            </div>

            <div className="flex gap-4 md:gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-12 h-12 md:w-16 md:h-16 border border-white/10 rounded-full flex items-center justify-center text-base font-black text-white/70 group-hover:text-accent group-hover:border-accent/30 transition-all duration-700">
                  0{i}
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  </section>
);

const CatalogPrintView = ({ items }: { items: AuctionItem[] }) => (
  <div className="print-only p-12 bg-white text-black min-h-screen">
    <div className="flex justify-between items-start border-b-2 border-black pb-8 mb-12">
      <div className="space-y-4">
        <h1 className="text-5xl font-serif uppercase tracking-tighter leading-none">Strawboss <br/>Archives</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Curated Acquisition Catalog</p>
      </div>
      <div className="text-right flex flex-col items-end gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest">{new Date().toLocaleDateString()}</p>
          <p className="text-[8px] font-sans opacity-40 uppercase tracking-[0.1em]">Strawboss Authenticated Record</p>
        </div>
        <div className="w-16 h-16 border border-black/10 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-black/5 rounded-full" />
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-x-12 gap-y-16">
      {items.map((item, index) => (
        <div key={item.id} className={cn("space-y-6 pb-12 border-b border-black/5", (index + 1) % 4 === 0 && "page-break")}>
          <div className="aspect-[4/5] bg-[#f7f7f7] overflow-hidden flex items-center justify-center p-8">
             <img src={item.images?.[0]} alt={item.title} className="max-w-full max-h-full object-contain shadow-2xl" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] px-3 py-1.5 bg-black text-white">{item.category}</span>
              <span className="text-[8px] font-mono text-black/40">LOT NO. {item.id.slice(-6).toUpperCase()}</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-serif italic text-black leading-tight">{item.title}</h3>
              <p className="text-[10px] text-black/50 leading-relaxed font-serif line-clamp-4">{item.description}</p>
            </div>
            <div className="pt-6 border-t border-black/10 flex justify-between items-baseline">
              <div>
                <p className="text-[8px] font-black uppercase tracking-widest text-black/30 mb-1">Estimated Value</p>
                <p className="text-2xl font-display font-medium text-black">${(item.currentBid || item.price)?.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-black/40 italic">Signature Piece</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>

    <div className="mt-auto pt-24 pb-8 border-t-2 border-black flex justify-between items-center text-[9px] font-black uppercase tracking-[0.5em]">
      <span>© 2026 Strawboss Estate acquisitions</span>
      <span className="opacity-20 font-mono tracking-normal">ST-CAT-{Math.random().toString(36).substring(7).toUpperCase()}</span>
    </div>
  </div>
);

const Archives = ({ 
  items, 
  onItemClick, 
  filterType, 
  setFilterType, 
  onToggleFavorite, 
  favorites, 
  onRefresh, 
  loading, 
  searchQuery, 
  setSearchQuery,
  sortBy,
  setSortBy,
  user,
  printSelectedIds,
  setPrintSelectedIds
}: any) => {
  const filteredItems = useMemo(() => {
    let result = items;
    if (filterType !== 'all') {
      if (filterType === 'Trending') {
        result = items.filter((i: AuctionItem) => i.bidCount > 5);
      } else {
        result = items.filter((i: AuctionItem) => i.category === filterType);
      }
    }
    if (searchQuery) {
      result = result.filter((i: AuctionItem) => 
        i.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        i.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return result;
  }, [items, filterType, searchQuery]);

  const sortedItems = useMemo(() => {
    const list = [...filteredItems];
    if (sortBy === 'price-low') {
      list.sort((a, b) => (a.price || a.currentBid || 0) - (b.price || b.currentBid || 0));
    } else if (sortBy === 'price-high') {
      list.sort((a, b) => (b.price || b.currentBid || 0) - (a.price || a.currentBid || 0));
    } else if (sortBy === 'newest') {
      list.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
    }
    return list;
  }, [filteredItems, sortBy]);

  return (
    <section className="relative min-h-screen pt-24 md:pt-36 pb-24 md:pb-40 bg-[#faf8f5]">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 md:px-12 space-y-10 md:space-y-16">
        
        {/* Gallery Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-stone-200">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="w-8 h-[1px] bg-amber-800" />
              <span className="text-[10px] md:text-xs font-sans font-semibold uppercase tracking-[0.25em] text-amber-900">
                ACTIVE AUCTION CATALOGUE & PRIVATE TREATY VAULTS
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-serif font-normal text-stone-900 tracking-tight leading-tight">
              Curated Masterpiece Register
            </h1>
            <p className="text-sm font-serif italic text-stone-600 max-w-xl">
              Authentic provenance guaranteed on all catalogued lots. Scientific condition certificates available upon consignor request.
            </p>
          </div>
          
          <div className="flex flex-col gap-4 md:items-end">
            {/* Filter Navigation Tabs */}
            <div className="flex items-center gap-1 sm:gap-2 bg-white border border-stone-300/80 p-1 overflow-x-auto no-scrollbar max-w-full">
              {['all', 'Trending', 'Fine Art', 'Timepieces', 'Furniture', 'Jewelry'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterType(cat)}
                  className={cn(
                    "px-3.5 py-1.5 text-[10px] sm:text-[11px] font-sans font-medium uppercase tracking-[0.16em] transition-colors whitespace-nowrap",
                    filterType === cat 
                      ? "bg-stone-900 text-stone-50" 
                      : "text-stone-600 hover:text-stone-950"
                  )}
                >
                  {cat === 'all' ? 'All Lots' : cat}
                </button>
              ))}
            </div>

            {/* Sort & Utility Row */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-white border border-stone-300/80 px-4 py-2 text-[10px] sm:text-xs font-sans font-medium uppercase tracking-[0.15em] appearance-none cursor-pointer pr-9 focus:border-stone-900 outline-none text-stone-800 transition-colors"
                >
                  <option value="newest">Sort: Newest Lots</option>
                  <option value="price-low">Valuation: Low to High</option>
                  <option value="price-high">Valuation: High to Low</option>
                </select>
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-90 text-stone-400 pointer-events-none" />
              </div>

              <button 
                onClick={() => {
                  const curatedItems = items.filter(item => printSelectedIds?.includes(item.id));
                  if (!curatedItems || curatedItems.length === 0) {
                    alert('Please select archives for your curated catalog by clicking the [Printer] button on any item card.');
                    return;
                  }
                  window.print();
                }}
                className="px-4 py-2 bg-white border border-stone-300 text-stone-800 text-[10px] sm:text-xs font-sans font-medium tracking-[0.15em] uppercase flex items-center gap-2 hover:bg-stone-900 hover:text-white transition-colors no-print"
                title="Print Curated Dossier"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Dossier ({printSelectedIds?.length || 0})</span>
              </button>

              <button 
                onClick={onRefresh}
                disabled={loading}
                className="w-8 h-8 flex items-center justify-center bg-white border border-stone-300 text-stone-700 hover:text-stone-950 hover:border-stone-800 transition-colors"
                title="Refresh lots"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              </button>
            </div>
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 md:gap-x-8 gap-y-6 md:gap-y-16">
          {/* Print View (Hidden on Screen) */}
          <CatalogPrintView items={items.filter(item => printSelectedIds?.includes(item.id))} />

          <AnimatePresence mode="popLayout">
            {loading ? (
              [...Array(8)].map((_, i) => <ItemCardSkeleton key={i} />)
            ) : sortedItems.length > 0 ? (
              sortedItems.map((item: AuctionItem) => (
                <ItemCard 
                  key={item.id} 
                  item={item} 
                  onClick={() => onItemClick(item)} 
                  isFavorite={favorites.includes(item.id)}
                  onToggleFavorite={(e) => onToggleFavorite(item.id, e)}
                  isSelectedForPrint={printSelectedIds?.includes(item.id)}
                  onTogglePrint={(e) => {
                    e.stopPropagation();
                    setPrintSelectedIds(prev => 
                      prev.includes(item.id) 
                        ? prev.filter(id => id !== item.id) 
                        : [...prev, item.id]
                    );
                  }}
                />
              ))
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full py-40 md:py-60 text-center space-y-8 md:space-y-12"
              >
                <div className="w-24 h-24 md:w-32 md:h-32 bg-black/[0.02] border border-black/[0.05] flex items-center justify-center mx-auto rounded-full">
                  <Search className="w-8 h-8 md:w-10 md:h-10 text-black/10" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-2xl md:text-4xl font-serif font-medium text-black italic">No acquisitions found</h3>
                  <p className="text-xs md:text-sm text-black/40 max-w-sm mx-auto font-medium tracking-wide">The archive filters have returned no matches. Try refining your curation.</p>
                </div>
                <div className="flex justify-center gap-4">
                  <button onClick={onRefresh} className="btn-primary px-8 md:px-12">Refresh</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Elite Reviews Section */}
        <div className="mt-40 md:mt-60 pt-24 md:pt-40 border-t border-black/[0.05] space-y-16 md:space-y-32">
          <div className="flex flex-col md:flex-row items-baseline justify-between gap-8 md:gap-12">
            <h3 className="text-4xl md:text-8xl font-serif font-medium text-black leading-[0.85] tracking-tighter uppercase max-w-2xl">
              Signature <br />
              <span className="italic font-light text-black/20">acquisitions</span>
            </h3>
            <p className="max-w-sm text-black/60 font-serif italic text-base md:text-xl leading-relaxed">
               "For those who understand that history isn't just kept, it's lived."
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-1 grid-flow-dense border border-black/5 bg-black/5">
            {[
              { name: "Alexander V.", role: "Curator", text: "The valuation precision here is unmatched. It's the only platform we trust for high-value private treaties." },
              { name: "Elena S.", role: "Archivist", text: "Provenance is everything. Strawboss provides the transparency needed for institutional-grade collections." },
              { name: "Julian M.", role: "Estate Liaison", text: "Global white-glove security combined with the ease of digital acquisition. Revolutionary." }
            ].map((review, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                className="bg-white p-8 md:p-16 space-y-8 md:space-y-12 flex flex-col justify-between"
              >
                <div className="space-y-6 md:space-y-8">
                  <div className="flex gap-1.5 md:gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <div key={star} className="w-1 md:w-1.5 h-1 md:h-1.5 bg-black" />
                    ))}
                  </div>
                  <p className="text-xl md:text-2xl font-serif italic text-black leading-relaxed">
                    "{review.text}"
                  </p>
                </div>
                <div className="pt-8 md:pt-12 border-t border-black/[0.05] flex items-center justify-between">
                  <div>
                    <p className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] text-black leading-none">{review.name}</p>
                    <p className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] text-black/30 mt-2 italic font-serif">{review.role}</p>
                  </div>
                  <span className="text-[9px] md:text-[10px] font-mono text-black/10">0{i+1}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const ProfileEditor = ({ profile, onSave, onCancel }: { profile: UserProfile, onSave: (data: Partial<UserProfile>) => Promise<void>, onCancel: () => void }) => {
  const [formData, setFormData] = useState({
    bio: profile.bio || '',
    preferredCategories: profile.preferredCategories || [],
    externalCollectionUrl: profile.externalCollectionUrl || '',
    location: profile.location || ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const categories = ['Fine Art', 'Timepieces', 'Furniture', 'Jewelry', 'Manuscripts', 'Other'];

  const toggleCategory = (cat: string) => {
    setFormData(prev => ({
      ...prev,
      preferredCategories: prev.preferredCategories.includes(cat)
        ? prev.preferredCategories.filter(c => c !== cat)
        : [...prev.preferredCategories, cat]
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      onCancel();
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl space-y-10">
      <div className="space-y-2">
        <h3 className="text-2xl font-bold text-primary tracking-tight">Edit Profile</h3>
        <p className="text-sm text-gray-500">Update your collector profile and interests.</p>
      </div>

      <div className="space-y-8">
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Biography</label>
          <textarea 
            rows={4}
            className="input-field min-h-[120px] resize-none"
            placeholder="Tell the community about your passion for antiquities..."
            value={formData.bio}
            onChange={e => setFormData({...formData, bio: e.target.value})}
          />
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Interests</label>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={cn(
                  "px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all",
                  formData.preferredCategories.includes(cat)
                    ? "bg-primary text-white shadow-lg"
                    : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Location</label>
            <input 
              type="text" 
              className="input-field"
              placeholder="e.g. London, UK"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">External Link</label>
            <input 
              type="url" 
              className="input-field"
              placeholder="https://your-collection.com"
              value={formData.externalCollectionUrl}
              onChange={e => setFormData({...formData, externalCollectionUrl: e.target.value})}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary flex-1 py-5"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <button 
          onClick={onCancel}
          className="flex-1 py-5 bg-gray-50 text-primary text-xs font-bold uppercase tracking-widest rounded-2xl hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};


export function getTrackingLink(carrier: string, trackingNum: string): string {
  const cleanNum = trackingNum.trim();
  switch (carrier.toLowerCase()) {
    case 'usps':
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${cleanNum}`;
    case 'fedex':
      return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${cleanNum}`;
    case 'ups':
      return `https://www.ups.com/track?tracknum=${cleanNum}`;
    case 'dhl':
    case 'dhl express':
      return `https://www.dhl.com/en/express/tracking.html?AWB=${cleanNum}`;
    case 'shippo':
      return `https://goshippo.com/track/${cleanNum}`;
    case 'aftership':
    default:
      return `https://track.aftership.com/${cleanNum}`;
  }
}

const OrderTracker = ({ 
  status, 
  trackingCarrier, 
  trackingNumber, 
  trackingLink,
  updatedAt 
}: { 
  status?: string, 
  trackingCarrier?: string, 
  trackingNumber?: string, 
  trackingLink?: string,
  updatedAt?: string
}) => {
  const steps = ["Payment Confirmed", "Processing", "Shipped", "Delivered"];
  // Default status
  const currentStatus = status || "Payment Confirmed";
  const currentIndex = steps.indexOf(currentStatus);
  const activeIndex = currentIndex !== -1 ? currentIndex : 0;

  return (
    <div className="bg-zinc-50 border border-black/5 p-6 md:p-8 rounded-3xl space-y-8 shadow-inner">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
            <Truck className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest text-primary">Prestige Dispatch Tracker</h4>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">
              Current Phase: <span className="text-accent font-black">{currentStatus}</span>
            </p>
          </div>
        </div>
        {updatedAt && (
          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest bg-white border border-black/5 px-3 py-1.5 rounded-full">
            Updated {new Date(updatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Progress tracker timeline */}
      <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-4 pt-4 pb-2">
        {/* Background connect line */}
        <div className="hidden md:block absolute left-6 right-6 top-[34px] h-0.5 bg-zinc-200 z-0">
          <div 
            className="h-full bg-accent transition-all duration-[1s] ease-in-out" 
            style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
          />
        </div>

        {steps.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;
          const isPastOrCurrent = idx <= activeIndex;

          let stepDesc = "";
          if (step === "Payment Confirmed") stepDesc = "Funds Transferred";
          else if (step === "Processing") stepDesc = "Vault Appraisal";
          else if (step === "Shipped") stepDesc = "Couriers Dispatched";
          else if (step === "Delivered") stepDesc = "Securely Received";

          return (
            <div key={step} className="flex md:flex-col items-center md:text-center gap-4 md:gap-3 z-10 w-full md:w-1/4">
              <div 
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-700 border-2",
                  isCompleted ? "bg-accent border-accent text-white shadow-md shadow-accent/20" :
                  isActive ? "bg-white border-accent text-accent ring-4 ring-accent/10 scale-110" :
                  "bg-white border-zinc-200 text-zinc-300"
                )}
              >
                {isCompleted ? "✓" : idx + 1}
              </div>
              <div className="space-y-0.5">
                <p 
                  className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                    isPastOrCurrent ? "text-primary" : "text-zinc-300"
                  )}
                >
                  {step}
                </p>
                <p className="text-[8px] text-zinc-400 font-bold tracking-wider uppercase">
                  {stepDesc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tracking info & link */}
      {trackingNumber ? (
        <div className="bg-white rounded-2xl p-6 border border-black/5 flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
          <div className="space-y-1">
            <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-widest block">Secure Delivery Passport</span>
            <p className="text-xs font-mono font-bold text-primary uppercase">
              {trackingCarrier || 'General Carrier'} — {trackingNumber}
            </p>
          </div>
          {trackingLink && (
            <a 
              href={trackingLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-6 py-3 bg-primary text-white text-[9px] font-black uppercase tracking-[0.3em] rounded-xl hover:bg-accent transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Follow Passage
            </a>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 border border-black/5 text-center">
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">
            Awaiting transit registry. Your elite courier will assign tracking details shortly.
          </p>
        </div>
      )}
    </div>
  );
};

const UserDashboard = ({ 
  userProfile, 
  favorites, 
  consignments, 
  onItemClick,
  onToggleFavorite,
  onLeaveReview,
  onUpdateProfile,
  onEditItem,
  items,
  searchQuery,
  setSearchQuery,
  loading
}: { 
  userProfile: UserProfile, 
  favorites: AuctionItem[], 
  consignments: AuctionItem[],
  onItemClick: (item: AuctionItem) => void,
  onToggleFavorite: (id: string, e: React.MouseEvent) => void,
  onLeaveReview: (item: AuctionItem) => void,
  onEditItem: (item: AuctionItem) => void,
  onUpdateProfile: (data: Partial<UserProfile>) => Promise<void>,
  items: AuctionItem[],
  searchQuery: string,
  setSearchQuery: (q: string) => void,
  loading?: boolean
}) => {
  const [recentlyViewed, setRecentlyViewed] = useState<AuctionItem[]>([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const acquisitions = useMemo(() => items.filter(i => i.buyerUid === userProfile.uid), [items, userProfile.uid]);

  useEffect(() => {
    const key = `recentlyViewed_${userProfile.uid}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const ids = JSON.parse(stored) as string[];
        const viewed = ids.map(id => items.find(i => i.id === id)).filter(Boolean) as AuctionItem[];
        setRecentlyViewed(viewed);
      } catch (e) {
        console.error("Failed to parse recently viewed items", e);
        localStorage.removeItem(key);
      }
    }
  }, [userProfile.uid, items]);

  return (
    <div className="max-w-[1400px] mx-auto py-12 md:py-20 px-6 space-y-16">
      {/* Profile Header */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 md:p-12 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-10">
          <div className="relative group">
            <LazyImage 
              src={userProfile.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + userProfile.uid} 
              alt="" 
              className="w-40 h-40 rounded-full object-cover border-4 border-white shadow-xl" 
            />
            <button 
              onClick={() => setIsEditingProfile(true)}
              className="absolute bottom-2 right-2 w-10 h-10 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:bg-accent transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 text-center md:text-left space-y-4">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold text-primary tracking-tight">{userProfile.displayName}</h2>
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 text-sm font-medium text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Filter className="w-4 h-4 rotate-90" />
                  {userProfile.location || 'Location not set'}
                </span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>Member since {userProfile.createdAt ? format(userProfile.createdAt.toDate(), 'MMM yyyy') : 'N/A'}</span>
              </div>
            </div>
            
            <p className="text-gray-600 max-w-2xl leading-relaxed">
              {userProfile.bio || 'Add a biography to your profile to tell other collectors about your interests.'}
            </p>

            <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-2">
              {userProfile.preferredCategories?.map(cat => (
                <span key={cat} className="px-4 py-1.5 bg-blue-50 text-primary text-xs font-bold uppercase tracking-widest rounded-full">
                  {cat}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8 text-center border-l border-gray-100 pl-10 hidden lg:grid">
            <div className="space-y-1">
              <span className="text-2xl font-bold text-primary">{favorites.length}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Saved</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl font-bold text-primary">{consignments.length}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Selling</span>
            </div>
            <div className="space-y-1">
              <span className="text-2xl font-bold text-primary">{acquisitions.length}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Bought</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Editor Modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingProfile(false)}
              className="absolute inset-0 bg-primary/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl"
            >
              <ProfileEditor 
                profile={userProfile} 
                onSave={onUpdateProfile} 
                onCancel={() => setIsEditingProfile(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tabs / Sections */}
      <div className="space-y-12">
        {/* Saved Items */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-primary uppercase tracking-widest">Saved Pieces</h3>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{favorites.length} Items</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {loading ? (
              [...Array(3)].map((_, i) => <ItemCardSkeleton key={i} />)
            ) : (
              favorites.map(item => (
                <ItemCard 
                  key={item.id} 
                  item={item} 
                  onClick={() => onItemClick(item)} 
                  isFavorite={true}
                  onToggleFavorite={(e) => onToggleFavorite(item.id, e)}
                />
              ))
            )}
            {!loading && favorites.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100 rounded-[2.5rem]">
                <p className="text-gray-400 font-medium">Your saved collection is empty.</p>
              </div>
            )}
          </div>
        </div>

        {/* My Consignments */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-primary uppercase tracking-widest">My Consignments</h3>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{consignments.length} Listings</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {consignments.map(item => (
              <ItemCard 
                key={item.id} 
                item={item} 
                onClick={() => onItemClick(item)} 
                isFavorite={favorites.some(f => f.id === item.id)}
                onToggleFavorite={(e) => onToggleFavorite(item.id, e)}
                onEdit={(e) => {
                  e.stopPropagation();
                  onEditItem(item);
                }}
              />
            ))}
            {consignments.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100 rounded-[2.5rem]">
                <p className="text-gray-400 font-medium">No artifacts currently listed for sale.</p>
              </div>
            )}
          </div>
        </div>

        {/* My Collection (Bought & Tracked Orders) */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-primary uppercase tracking-widest">My Collection & Tracks</h3>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{acquisitions.length} Artifacts</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {acquisitions.map(item => {
              const currentStatus = item.orderStatus || "Payment Confirmed";
              let badgeColor = "bg-zinc-100/80 text-zinc-800 border-zinc-200/50";
              if (currentStatus === "Processing") badgeColor = "bg-amber-100/80 text-amber-900 border-amber-200/50";
              else if (currentStatus === "Shipped") badgeColor = "bg-blue-100/80 text-blue-900 border-blue-200/50";
              else if (currentStatus === "Delivered") badgeColor = "bg-emerald-100/80 text-emerald-900 border-emerald-200/50";

              return (
                <div key={item.id} className="space-y-4 bg-white p-4 border border-zinc-100 rounded-[2.5rem]">
                  <div className="relative">
                    <ItemCard 
                      item={item} 
                      onClick={() => onItemClick(item)} 
                      isFavorite={favorites.some(f => f.id === item.id)}
                      onToggleFavorite={(e) => onToggleFavorite(item.id, e)}
                    />
                    <div className="absolute top-4 left-4 z-10">
                      <span className={cn(
                        "px-4 py-1.5 rounded-full text-[8.5px] font-black uppercase tracking-[0.2em] border shadow-sm backdrop-blur-md",
                        badgeColor
                      )}>
                        {currentStatus}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => setExpandedOrderId(item.id)}
                      className="py-4 bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-accent transition-colors flex items-center justify-center gap-2"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      Track Dispatch
                    </button>
                    <button
                      onClick={() => onLeaveReview(item)}
                      className="py-4 bg-zinc-50 border border-black/5 text-[10px] text-zinc-800 font-bold uppercase tracking-widest hover:bg-zinc-100 transition-colors"
                    >
                      Leave Feedback
                    </button>
                  </div>
                </div>
              );
            })}
            {acquisitions.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100 rounded-[2.5rem]">
                <p className="text-gray-400 font-medium">Your acquired collection is empty.</p>
              </div>
            )}
          </div>
        </div>

        {/* Slide-over Tracking Drawer Sheet */}
        <AnimatePresence>
          {expandedOrderId && (() => {
            const item = acquisitions.find(a => a.id === expandedOrderId);
            if (!item) return null;
            return (
              <div className="fixed inset-0 z-[150] flex justify-end">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.5 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setExpandedOrderId(null)}
                  className="absolute inset-0 bg-black"
                />
                {/* Drawer Sheet */}
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "spring", damping: 30, stiffness: 300 }}
                  className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-[160] overflow-y-auto border-l border-zinc-100"
                >
                  {/* Header */}
                  <div className="p-8 border-b border-black/5 flex items-center justify-between bg-zinc-50/50">
                    <div>
                      <span className="text-[10px] text-accent font-black tracking-[0.3em] uppercase block mb-1">Acquisition Dispatch</span>
                      <h3 className="text-2xl font-serif font-black text-ink uppercase tracking-tight">Delivery Transit</h3>
                    </div>
                    <button 
                      onClick={() => setExpandedOrderId(null)}
                      className="w-10 h-10 rounded-full hover:bg-zinc-200 flex items-center justify-center transition-colors text-ink/70"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-8 space-y-8 flex-1">
                    {/* Order Item Info */}
                    <div className="flex gap-6 items-center bg-zinc-50 p-6 rounded-3xl border border-black/[0.02]">
                      <img 
                        src={item.images[0]} 
                        alt={item.title} 
                        className="w-20 h-24 object-cover rounded-xl shadow-md border border-white"
                      />
                      <div className="space-y-1.5 flex-1">
                        <span className="text-[8px] font-black uppercase tracking-[0.25em] text-accent bg-accent/5 px-2.5 py-1 rounded-full">{item.category}</span>
                        <h4 className="text-base font-serif font-black text-primary line-clamp-1 mt-1">{item.title}</h4>
                        <p className="text-sm font-semibold font-mono text-ink/70">${(item.currentBid || item.price || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Order Tracker */}
                    <OrderTracker 
                      status={item.orderStatus} 
                      trackingCarrier={item.trackingCarrier} 
                      trackingNumber={item.trackingNumber} 
                      trackingLink={item.trackingLink}
                      updatedAt={item.orderStatusUpdatedAt}
                    />

                    {/* Extra Delivery Guarantee */}
                    <div className="p-6 bg-zinc-50 rounded-2xl border border-black/5 space-y-4">
                      <div className="flex gap-4 items-start">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-primary">Prestige Safe-Transit Pledge</p>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1 leading-relaxed">
                            Your legacy artifact is secured in temperature-regulated vaults and is accompanied by our elite multi-signature courier specialists. Included is 100% loss-protection insurance.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer action */}
                  <div className="p-8 border-t border-black/5 flex gap-4 bg-zinc-50">
                    <button 
                      onClick={() => {
                        onItemClick(item);
                        setExpandedOrderId(null);
                      }}
                      className="flex-grow py-5 bg-primary text-white text-xs font-black uppercase tracking-widest hover:bg-accent transition-colors text-center shadow-lg"
                    >
                      View Archive Provenance
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
        </AnimatePresence>
      </div>
    </div>
  );
};

const ConsignmentForm = ({ 
  onCancel, 
  onSubmit, 
  initialData,
  onError 
}: { 
  onCancel: () => void, 
  onSubmit: (data: any) => void, 
  initialData?: any,
  onError?: (error: Error) => void
}) => {
  const [formData, setFormData] = useState(() => {
    const base = {
      title: '',
      description: '',
      listingType: 'buy-now' as 'buy-now' | 'auction',
      category: 'Fine Art',
      price: '',
      startingBid: '',
      duration: '7',
      endTime: '',
      images: [] as string[]
    };
    if (initialData) {
      return { ...base, ...initialData };
    }
    return base;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.title.trim()) newErrors.title = "Item title is required";
    if (!formData.description.trim()) newErrors.description = "Provenance and history details are required";
    if (formData.listingType === 'buy-now' && (!formData.price || Number(formData.price) <= 0)) {
      newErrors.price = "Valid asking price is required";
    }
    if (formData.listingType === 'auction' && (!formData.startingBid || Number(formData.startingBid) <= 0)) {
      newErrors.startingBid = "Valid starting reserve is required";
    }
    if (formData.images.length === 0) newErrors.images = "Item visual documentation is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = () => {
    if (validate()) {
      onSubmit(formData);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newImages: string[] = [...formData.images];
      let loadedCount = 0;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newImages.push(reader.result as string);
          loadedCount++;
          if (loadedCount === files.length) {
            setFormData({ ...formData, images: newImages });
            if (errors.images) setErrors(prev => {
              const next = { ...prev };
              delete next.images;
              return next;
            });
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData({ ...formData, images: newImages });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      className="max-w-[1400px] mx-auto py-12 md:py-20 px-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-8 md:gap-12 items-start">
        {/* Left Side: Photography Guide */}
        <div className="bg-zinc-50 p-6 md:p-8 space-y-6 md:space-y-8 rounded-3xl">
          <h3 className="text-base md:text-lg font-bold text-black uppercase tracking-widest">Photography Guide</h3>
          <ul className="space-y-3 md:space-y-4 text-xs md:text-sm font-medium text-zinc-600">
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-black mt-1.5" />
              <span>Use natural, soft lighting</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-black mt-1.5" />
              <span>Include multiple angles</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-black mt-1.5" />
              <span>Focus on makers' marks or signatures</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
              <span>Plain, neutral backgrounds preferred</span>
            </li>
          </ul>
          
          <div className="pt-6 md:pt-8 border-t border-black/5">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {formData.images.map((img: string, idx: number) => (
                  <div key={idx} className="relative aspect-square group rounded-xl overflow-hidden border border-black/5 shadow-sm">
                    <img src={img} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => removeImage(idx)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                <div className="relative group">
                  <input 
                    type="file" 
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <label 
                    htmlFor="image-upload"
                    className={cn(
                      "aspect-square bg-white border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 overflow-hidden rounded-2xl",
                      errors.images ? "border-red-300" : "border-gray-200 hover:border-primary hover:bg-blue-50/30"
                    )}
                  >
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <Plus className="w-6 h-6" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Add Photo</span>
                    </div>
                  </label>
                </div>
              </div>
              {errors.images && <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">{errors.images}</p>}
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] border border-gray-100 p-6 md:p-12 shadow-sm space-y-8 md:space-y-10">
          <div className="space-y-2 border-b border-gray-100 pb-6">
            <h2 className="text-xl md:text-2xl font-serif font-black text-primary uppercase tracking-tight">
              {initialData ? 'Refine Artifact Details' : 'Consign New Artifact'}
            </h2>
            <p className="text-[10px] md:text-sm text-zinc-400 font-medium tracking-widest uppercase">
              {initialData ? 'Update provenance and valuation' : 'Submit for elite curation'}
            </p>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Item Title</label>
              <input 
                className="input-field"
                placeholder="e.g. 17th Century Imperial Jade Vessel"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
              {errors.title && <p className="text-xs font-bold text-red-500 mt-2">{errors.title}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Listing Arrangement</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, listingType: 'buy-now' })}
                  className={cn(
                    "py-4 px-6 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 cursor-pointer text-center",
                    formData.listingType === 'buy-now' 
                      ? "bg-black text-white border-black" 
                      : "bg-white text-zinc-500 border-zinc-200 hover:border-black/20 hover:text-black"
                  )}
                >
                  Private Treaty (Buy Now)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, listingType: 'auction' })}
                  className={cn(
                    "py-4 px-6 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all duration-300 cursor-pointer text-center",
                    formData.listingType === 'auction' 
                      ? "bg-black text-white border-black" 
                      : "bg-white text-zinc-500 border-zinc-200 hover:border-black/20 hover:text-black"
                  )}
                >
                  Archival Auction
                </button>
              </div>
            </div>

            {formData.listingType === 'auction' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Auction Duration (Days)</label>
                  <select
                    className="input-field appearance-none"
                    value={formData.duration}
                    onChange={e => setFormData({ ...formData, duration: e.target.value })}
                  >
                    <option value="1">1 Day</option>
                    <option value="3">3 Days</option>
                    <option value="5">5 Days</option>
                    <option value="7">7 Days</option>
                    <option value="14">14 Days</option>
                    <option value="30">30 Days</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Specific Auction End Time</label>
                  <input
                    type="datetime-local"
                    className="input-field"
                    value={formData.endTime}
                    onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                  />
                  <p className="text-[9px] text-zinc-400 font-medium">Override duration with a custom end date/time.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Category</label>
                <select 
                  className="input-field appearance-none"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value})}
                >
                  <option value="Fine Art">Fine Art</option>
                  <option value="Timepieces">Timepieces</option>
                  <option value="Furniture">Furniture</option>
                  <option value="Jewelry">Jewelry</option>
                  <option value="Manuscripts">Manuscripts</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  {formData.listingType === 'buy-now' ? 'Estimated Value ($)' : 'Starting Reserve ($)'}
                </label>
                <div className="relative">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300">$</span>
                  <input 
                    type="number" 
                    className="input-field pl-12"
                    placeholder="0.00"
                    value={formData.listingType === 'buy-now' ? formData.price : formData.startingBid}
                    onChange={e => {
                      const field = formData.listingType === 'buy-now' ? 'price' : 'startingBid';
                      setFormData({...formData, [field]: e.target.value});
                    }}
                  />
                </div>
                {(errors.price || errors.startingBid) && <p className="text-xs font-bold text-red-500 mt-2">{errors.price || errors.startingBid}</p>}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Provenance & History</label>
              <textarea 
                className="input-field min-h-[200px] resize-none"
                placeholder="Detail the item's history, previous owners, and any certification of authenticity..."
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              />
              {errors.description && <p className="text-xs font-bold text-red-500 mt-2">{errors.description}</p>}
            </div>
          </div>

          <div className="pt-4 space-y-6">
            <button 
              onClick={handleFormSubmit}
              className="btn-primary w-full py-6 text-base"
            >
              {initialData ? 'Update Artifact Details' : 'Submit Piece for Review'}
            </button>
            <p className="text-[10px] font-bold text-center text-gray-400 uppercase tracking-widest">
              By submitting, you agree to our terms of authenticity.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const ItemDetail = ({ 
  item, 
  user, 
  onBack, 
  reviews,
  allItems,
  onItemClick,
  favorites,
  onToggleFavorite,
  userProfile,
  loading,
  onShowToast,
  onError,
  onRefresh
}: { 
  item: AuctionItem, 
  user: User | null, 
  onBack: () => void, 
  reviews: Review[],
  allItems: AuctionItem[],
  onItemClick: (item: AuctionItem) => void,
  favorites: string[],
  onToggleFavorite: (id: string, e?: React.MouseEvent) => void,
  userProfile: UserProfile | null,
  loading?: boolean,
  onShowToast?: () => void,
  onError?: (error: Error) => void,
  onRefresh?: () => void
}) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isBuying, setIsBuying] = useState(false);

  const isWatching = favorites.includes(item.id);

  const [showCheckout, setShowCheckout] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [selectedImage, setSelectedImage] = useState(item.images[0] || `https://picsum.photos/seed/${item.id}/1200/1500`);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [showHammer, setShowHammer] = useState(false);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = `Strawboss Archives: ${item.title}`;
    const shareText = `Discover this rare piece on Strawboss Archives: ${item.title}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
        return;
      } catch (err) {
        // Fallback to custom modal
      }
    }
    setShowShareModal(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareInstagram = () => {
    const caption = `Rare piece from Strawboss Archives: ${item.title} ($${(item.currentBid || item.price || 0).toLocaleString()})\n\nExplore at: ${window.location.href} #vintage #antiques #rarecollection #strawboss`;
    navigator.clipboard.writeText(caption);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    window.open('https://www.instagram.com', '_blank');
  };

  const handleShareTikTok = () => {
    const caption = `Look at this incredible archival find on Strawboss: ${item.title} ✨ #rare #collector #history #antiques #auction`;
    navigator.clipboard.writeText(caption);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    window.open('https://www.tiktok.com', '_blank');
  };

  const handleImageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 15;
    const rotateY = (centerX - x) / 15;
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleImageMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  const relatedItems = useMemo(() => {
    return allItems
      .filter(i => i.id !== item.id && (i.category === item.category || i.title.split(' ').some(word => item.title.includes(word))))
      .slice(0, 4);
  }, [allItems, item]);

  useEffect(() => {
    if (user) {
      const key = `recentlyViewed_${user.uid}`;
      const stored = localStorage.getItem(key);
      let ids = stored ? (JSON.parse(stored) as string[]) : [];
      ids = ids.filter(id => id !== item.id);
      ids.unshift(item.id);
      ids = ids.slice(0, 6);
      localStorage.setItem(key, JSON.stringify(ids));
    }
  }, [user, item.id]);

  useEffect(() => {
    setLoadingBids(true);
    // Limit bids to save quota
    const q = query(collection(db, `items/${item.id}/bids`), orderBy('amount', 'desc'), limit(20));
    return onSnapshot(q, (snapshot) => {
      setBids(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bid)));
      setLoadingBids(false);
    }, (error) => {
      if (error.message?.includes('Quota limit exceeded')) {
        console.warn('Quota limit exceeded for bids.');
      } else {
        if (onError) onError(handleFirestoreError(error, OperationType.GET, `items/${item.id}/bids`));
      }
      setLoadingBids(false);
    });
  }, [item.id]);

  const handlePlaceBid = async () => {
    if (!user) {
      if (onError) onError(new Error("Authentication required to place a bid."));
      return;
    }
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= (item.currentBid || 0)) {
      if (onError) onError(new Error("Please enter a valid bid higher than the current bid."));
      return;
    }

    const previousBidderUid = item.lastBidderUid;

    try {
      await addDoc(collection(db, `items/${item.id}/bids`), {
        itemId: item.id,
        bidderUid: user.uid,
        bidderName: userProfile?.displayName || user.displayName || 'Anonymous Collector',
        amount,
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, 'items', item.id), {
        currentBid: amount,
        bidCount: (item.bidCount || 0) + 1,
        lastBidderUid: user.uid,
        lastBidderName: userProfile?.displayName || user.displayName || 'Anonymous Collector'
      });

      // Optimistically update local state
      if (onRefresh) {
        // We don't have direct access to setItems here, but we can trigger a delayed refresh
        // and hope the parent's state update (if any) or the refresh handles it.
        // Actually, ItemDetail doesn't have setItems.
        // But handlePlaceBid is inside ItemDetail.
        // I should probably pass a way to update the item locally.
        setTimeout(onRefresh, 3000);
      }

      setShowHammer(true);
      setTimeout(() => setShowHammer(false), 2000);

      // Notify previous bidder
      if (previousBidderUid && previousBidderUid !== user.uid) {
        try {
          const prevUserDoc = await getDoc(doc(db, 'users', previousBidderUid));
          if (prevUserDoc.exists()) {
            const prevUser = prevUserDoc.data();
            if (prevUser.email) {
              await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  to: prevUser.email,
                  subject: `Outbid: ${item.title}`,
                  html: `<p>You have been outbid on <strong>${item.title}</strong>!</p>
                         <p>New Highest Bid: $${amount}</p>
                         <a href="${window.location.origin}">Return to Archives</a>`
                })
              });
            }
          }
        } catch (err) {
          console.warn('Failed to notify previous bidder due to quota or other error:', err);
        }
      }

      setBidAmount('');
    } catch (error) {
      console.error("Error placing bid:", error);
    }
  };

  const handleConfirmPurchase = async (details: any) => {
    if (!user) return;
    setIsBuying(true);
    setShowCheckout(false);
    // Simulate payment processing
    setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'items', item.id), {
          status: 'sold',
          buyerUid: user.uid,
          buyerDetails: details,
          orderStatus: 'Payment Confirmed',
          orderStatusUpdatedAt: new Date().toISOString()
        });
        
        // Refresh data with delay
        if (onRefresh) setTimeout(onRefresh, 3000);

        setOrderConfirmed(true);
        setIsBuying(false);
      } catch (error) {
        if (onError) onError(handleFirestoreError(error, OperationType.UPDATE, `items/${item.id}`));
        setIsBuying(false);
      }
    }, 2000);
  };

  const originalPrice = (item.price || item.currentBid || 1000) * 1.25;
  const discountPercent = 20;

  return (
    <div className="min-h-screen bg-paper pb-20 md:pb-40">
      <AnimatePresence>
        {showCheckout && user && (
          <CheckoutModal 
            item={item} 
            user={user} 
            onCancel={() => setShowCheckout(false)} 
            onConfirm={handleConfirmPurchase} 
          />
        )}
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-paper border border-black/10 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative space-y-6"
            >
              <button
                onClick={() => setShowShareModal(false)}
                className="absolute top-5 right-5 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-ink/60 transition-all cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent">Curated Discovery</span>
                <h3 className="text-xl font-serif font-black text-primary uppercase">Share This Acquisition</h3>
                <p className="text-xs text-ink/70">Share this authenticated archival piece with your network or followers.</p>
              </div>

              <div className="space-y-3">
                {/* Instagram Option */}
                <button
                  onClick={handleShareInstagram}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-gradient-to-r from-[#f09433]/10 via-[#e6683c]/10 to-[#bc1888]/10 hover:from-[#f09433]/20 hover:via-[#e6683c]/20 hover:to-[#bc1888]/20 border border-[#e6683c]/20 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center text-white shadow-md">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-wider text-primary">Share to Instagram</p>
                      <p className="text-[10px] text-ink/60">Copies caption + tags & opens app</p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>

                {/* TikTok Option */}
                <button
                  onClick={handleShareTikTok}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-black/5 hover:bg-black/10 border border-black/10 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shadow-md">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z"/>
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-wider text-primary">Share to TikTok</p>
                      <p className="text-[10px] text-ink/60">Copies post hook & opens TikTok</p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>

                {/* Copy Link Option */}
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-white hover:bg-stone-50 border border-black/10 shadow-sm transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 text-primary flex items-center justify-center">
                      {copiedLink ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5 text-ink/80" />}
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-wider text-primary">
                        {copiedLink ? 'Link Copied to Clipboard!' : 'Copy Direct Link'}
                      </p>
                      <p className="text-[10px] text-ink/60">Direct archival permalink</p>
                    </div>
                  </div>
                  {copiedLink && <span className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Copied</span>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Sticky Action Bar - Amazon Style */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[110] bg-white/95 backdrop-blur-xl border-t border-black/5 p-4 flex items-center gap-4 safe-area-pb shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <div className="flex-1">
          <p className="text-[8px] font-black text-ink/40 uppercase tracking-widest">Current Valuation</p>
          <p className="text-xl font-serif font-black text-accent leading-none">
            ${(item.currentBid || item.price || 0).toLocaleString()}
          </p>
        </div>
        <button 
          onClick={() => {
            if (item.listingType === 'auction') {
              // Scroll to bid section or open bid modal
              const bidInput = document.getElementById('bid-input');
              if (bidInput) bidInput.scrollIntoView({ behavior: 'smooth' });
            } else {
              setShowCheckout(true);
            }
          }}
          className="bg-primary text-white px-8 py-4 rounded-xl text-xs font-black uppercase tracking-[0.3em] shadow-xl active:scale-95 transition-all"
        >
          {item.listingType === 'auction' ? 'Place Valuation' : 'Acquire Now'}
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 md:pt-16">
        <button onClick={onBack} className="group flex items-center gap-3 text-xs md:text-sm font-black uppercase tracking-[0.35em] text-ink/70 hover:text-primary transition-all mb-6 md:mb-10">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-2 transition-transform" />
          Back to Archives
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Thumbnails and Main Image */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col-reverse md:flex-row gap-4 md:gap-5 items-start">
              {/* Thumbnails */}
              <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto max-w-full md:max-h-[480px] scrollbar-hide pb-2 md:pb-0 flex-shrink-0">
                {item.images.map((img, idx) => (
                  <button 
                    key={idx}
                    onClick={() => {
                      setSelectedImage(img);
                    }}
                    className={cn(
                      "w-14 h-14 md:w-16 md:h-16 flex-shrink-0 rounded-xl overflow-hidden border-2 bg-stone-100 p-1 transition-all cursor-pointer",
                      (selectedImage === img) ? "border-accent shadow-md ring-2 ring-accent/30" : "border-black/5 opacity-60 hover:opacity-100"
                    )}
                    aria-label={`Select photo ${idx + 1}`}
                  >
                    <img src={img} alt={`${item.title} view ${idx + 1}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>

              {/* Main Image Frame - Bound to safe height with object-contain so it is NEVER cut in half */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative flex-1 w-full h-[360px] sm:h-[420px] md:h-[480px] rounded-2xl md:rounded-3xl overflow-hidden bg-gradient-to-b from-[#fbfaf7] via-[#f4f0e6] to-[#eae4d5] border border-black/10 shadow-xl group perspective-[2000px] flex items-center justify-center p-4 md:p-6 select-none"
                onMouseMove={handleImageMouseMove}
                onMouseLeave={handleImageMouseLeave}
              >
                {/* Soft ambient depth backdrop */}
                <div 
                  className="absolute inset-0 bg-cover bg-center blur-2xl opacity-20 scale-110 pointer-events-none" 
                  style={{ backgroundImage: `url(${selectedImage})` }} 
                />

                <motion.div
                  animate={{ 
                    rotateX: rotate.x, 
                    rotateY: rotate.y,
                  }}
                  transition={{ type: 'spring', stiffness: 100, damping: 30 }}
                  className="relative z-10 w-full h-full flex items-center justify-center cursor-zoom-in"
                  onClick={() => setIsZoomOpen(true)}
                  title="Click to view high-resolution photo"
                >
                  <img 
                    src={selectedImage} 
                    alt={item.title} 
                    className="max-w-full max-h-full w-auto h-auto object-contain filter drop-shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]" 
                    referrerPolicy="no-referrer"
                  />
                  {/* Subtle shine effect on hover */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1.2s] pointer-events-none" />
                </motion.div>

                {/* Hammer Animation Overlay */}
                <AnimatePresence>
                  {showHammer && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                      animate={{ opacity: 1, scale: 1.5, rotate: 0 }}
                      exit={{ opacity: 0, scale: 2, rotate: 45 }}
                      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                    >
                      <div className="bg-accent/90 backdrop-blur-xl p-10 rounded-full shadow-[0_0_100px_rgba(225,29,72,0.5)]">
                        <Gavel className="w-20 h-20 text-white" />
                        <motion.p 
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="text-white font-black uppercase tracking-[0.4em] mt-3 text-center text-xs"
                        >
                          Valuation Accepted
                        </motion.p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Live Status Badge */}
                <div className="absolute top-4 left-4 z-20">
                  <div className="bg-accent text-white px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.25em] flex items-center gap-2 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Live Valuation
                  </div>
                </div>
                
                {/* Watchlist Heart Button */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(item.id, e);
                  }}
                  className="absolute top-4 right-4 z-20 w-11 h-11 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-105 transition-all group/heart text-primary"
                  title="Save to watchlist"
                  aria-label="Save to watchlist"
                >
                  <Heart className={cn(
                    "w-5 h-5 transition-colors",
                    favorites.includes(item.id) ? "fill-accent text-accent" : "text-primary group-hover/heart:text-accent"
                  )} />
                </button>

                {/* Zoom / Fullscreen Button */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsZoomOpen(true);
                  }}
                  className="absolute bottom-4 right-4 z-20 w-11 h-11 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-105 transition-all text-primary"
                  title="Expand Fullscreen"
                  aria-label="Expand Fullscreen"
                >
                  <Search className="w-5 h-5" />
                </button>
              </motion.div>
            </div>

            {/* Museum & Provenance Trust Strip */}
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="bg-white/70 backdrop-blur-sm border border-black/5 rounded-xl p-2.5 flex flex-col items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-accent mb-1" />
                <span className="text-[9px] font-black uppercase tracking-wider text-primary">100% Authentic</span>
                <span className="text-[8px] text-ink/50">Verified Provenance</span>
              </div>
              <div className="bg-white/70 backdrop-blur-sm border border-black/5 rounded-xl p-2.5 flex flex-col items-center justify-center">
                <Package className="w-4 h-4 text-accent mb-1" />
                <span className="text-[9px] font-black uppercase tracking-wider text-primary">Conservation Grade</span>
                <span className="text-[8px] text-ink/50">Archival Care</span>
              </div>
              <div className="bg-white/70 backdrop-blur-sm border border-black/5 rounded-xl p-2.5 flex flex-col items-center justify-center">
                <Truck className="w-4 h-4 text-accent mb-1" />
                <span className="text-[9px] font-black uppercase tracking-wider text-primary">Insured Courier</span>
                <span className="text-[8px] text-ink/50">Global Priority</span>
              </div>
            </div>

            {/* High Resolution Lightbox Modal */}
            <AnimatePresence>
              {isZoomOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center p-4 md:p-8"
                  onClick={() => setIsZoomOpen(false)}
                >
                  <button
                    onClick={() => setIsZoomOpen(false)}
                    className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all cursor-pointer"
                    aria-label="Close high-res view"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <div className="max-w-4xl max-h-[82vh] flex items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
                    <img
                      src={selectedImage}
                      alt={item.title}
                      className="max-w-full max-h-[82vh] object-contain rounded-xl shadow-2xl"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <p className="text-white/70 text-xs font-serif mt-4 text-center">
                    {item.title} • Strawboss Archival Master View
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Product Details */}
          <div className="lg:col-span-5 space-y-6 md:space-y-8">
            <div className="space-y-4 md:space-y-6">
              <div className="space-y-2">
                <p className="text-accent font-black text-xs md:text-base uppercase tracking-[0.6em]">STRAWBOSS ARCHIVES</p>
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-2xl md:text-3xl font-serif font-black text-primary tracking-tighter leading-tight uppercase">
                    {item.title}
                  </h1>
                  <button
                    onClick={handleShare}
                    className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/90 hover:bg-white border border-black/10 shadow-sm text-xs font-black uppercase tracking-wider text-primary hover:text-accent transition-all cursor-pointer"
                    title="Share item on Instagram, TikTok, or copy link"
                  >
                    <Share2 className="w-4 h-4 text-accent" />
                    <span className="hidden sm:inline">Share</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex gap-0.5 md:gap-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className="w-3 h-3 md:w-4 md:h-4 fill-accent text-accent" />
                  ))}
                </div>
                <span className="text-xs md:text-base font-black text-ink/80 uppercase tracking-widest border-b border-primary/10 pb-1">
                  SB Expert Rating (4.9)
                </span>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-sans font-medium text-stone-500">
                    {item.listingType === 'auction' ? 'Current Live Reserve' : 'Private Treaty Valuation'}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-5xl font-serif font-medium text-stone-900 tabular-nums">
                      ${(item.listingType === 'auction' ? item.currentBid : item.price)?.toLocaleString()}
                    </span>
                    <span className="text-sm font-sans font-medium text-stone-500 uppercase tracking-widest">USD</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-sans text-stone-600 pt-1">
                  <span className="flex items-center gap-1.5 text-stone-700">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-800" />
                    <span>Reserve Condition Met</span>
                  </span>
                  <span>·</span>
                  <span>Buyer's Premium: Standard 12%</span>
                  {item.listingType === 'auction' && (
                    <>
                      <span>·</span>
                      <span className="font-medium text-stone-900">{item.bidCount} Registered Bids</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Auction Paddle & Action Deck */}
            <div className="space-y-6 pt-2">
              {item.listingType === 'auction' && (
                <div className="bg-[#f7f5f1] p-5 sm:p-6 border border-stone-200/90 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-sans font-semibold uppercase tracking-[0.2em] text-stone-600">
                      Live Hammer Countdown
                    </span>
                    <CountdownTimer endTime={item.endTime} />
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t border-stone-200 text-xs font-sans">
                    <span className="text-stone-500">Highest Bid Paddle</span>
                    <span className="font-serif italic text-stone-900">
                      {item.lastBidderUid ? 'Verified Collector #' + item.lastBidderUid.slice(0, 5).toUpperCase() : 'Awaiting Opening Bid'}
                    </span>
                  </div>
                </div>
              )}

              {item.status === 'active' ? (
                <div className="space-y-4">
                  {item.listingType === 'buy-now' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button 
                        onClick={() => setShowCheckout(true)}
                        className="btn-primary !py-4 text-xs font-sans tracking-[0.2em]"
                      >
                        Acquire via Private Treaty
                      </button>
                      <button 
                        onClick={() => onToggleFavorite(item.id)}
                        className={cn(
                          "btn-outline !py-4 text-xs font-sans tracking-[0.2em] bg-white",
                          isWatching ? "border-amber-900 text-amber-900" : ""
                        )}
                      >
                        {isWatching ? 'Saved to Watchlist' : 'Add to Watchlist'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-serif text-lg">$</span>
                        <input 
                          id="bid-input"
                          type="number" 
                          className="w-full bg-white border border-stone-300 py-3.5 pl-9 pr-4 outline-none focus:border-stone-900 font-serif text-lg text-stone-900 rounded-none transition-colors"
                          placeholder={`Enter bid amount (Min. $${((item.currentBid || 0) + 500).toLocaleString()})`}
                          value={bidAmount}
                          onChange={e => setBidAmount(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handlePlaceBid}
                          className="flex-1 btn-primary !py-4 text-xs font-sans tracking-[0.2em]"
                        >
                          Submit Formal Bid Paddle
                        </button>
                        <button 
                          onClick={() => onToggleFavorite(item.id)}
                          className={cn(
                            "btn-outline !py-4 !px-6 text-xs font-sans tracking-[0.15em] bg-white whitespace-nowrap",
                            isWatching ? "border-amber-900 text-amber-900" : ""
                          )}
                        >
                          {isWatching ? 'Watching' : 'Watch'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {user && item.buyerUid === user.uid ? (
                    <div className="space-y-6">
                      <div className="w-full bg-emerald-500/10 text-emerald-700 py-6 rounded-2xl text-center text-sm font-black tracking-[0.4em] uppercase border border-emerald-500/25">
                        ✓ You Have Acquired This Historical Piece
                      </div>
                      <OrderTracker 
                        status={item.orderStatus} 
                        trackingCarrier={item.trackingCarrier} 
                        trackingNumber={item.trackingNumber} 
                        trackingLink={item.trackingLink} 
                        updatedAt={item.orderStatusUpdatedAt}
                      />
                    </div>
                  ) : (
                    <div className="w-full bg-primary/5 text-primary/20 py-10 rounded-2xl text-center text-base font-black tracking-[0.6em] uppercase border-2 border-dashed border-primary/10">
                      Piece Acquired
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Offers & Perks */}
            <div className="space-y-8 pt-12 border-t border-primary/5">
              <h3 className="text-base font-black uppercase tracking-[0.5em] text-primary">Offers & Perks</h3>
              <div className="space-y-4">
                <div className="bg-paper p-8 rounded-3xl border border-primary/5 flex items-center justify-between group hover:border-accent/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                      <ShieldCheck className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-primary uppercase tracking-widest">Elite Authentication</h4>
                      <p className="text-[10px] text-ink/80 uppercase tracking-widest mt-1">Full Provenance Report Included</p>
                    </div>
                  </div>
                  <Info className="w-5 h-5 text-primary/20 group-hover:text-accent transition-colors" />
                </div>
              </div>
            </div>

            {/* Bid History & Provenance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-12 border-t border-primary/5">
              <div className="space-y-6">
                <h4 className="text-lg font-black uppercase tracking-widest text-primary">Provenancial History</h4>
                <div className="space-y-4">
                  <div className="flex gap-4 items-start">
                    <div className="w-1 h-1 rounded-full bg-accent mt-2" />
                    <p className="text-sm text-ink/70 font-serif italic">Authenticated by Strawboss Elite Appraisal Team.</p>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="w-1 h-1 rounded-full bg-accent mt-2" />
                    <p className="text-sm text-ink/70 font-serif italic">Certificate of Authenticity included with acquisition.</p>
                  </div>
                </div>
              </div>

            </div>

            {/* Seller Info */}
            <div className="pt-12 border-t border-primary/5">
              <div className="bg-paper p-8 rounded-3xl border border-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center border border-primary/5">
                    <UserIcon className="w-8 h-8 text-primary/40" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black uppercase tracking-widest text-primary">{item.sellerName}</h4>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-accent" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-accent">Verified Elite Consignor</span>
                    </div>
                  </div>
                </div>
                <div className="hidden md:flex gap-12">
                  <div className="text-center">
                    <p className="text-xl font-serif font-black text-primary">48</p>
                    <p className="text-[8px] uppercase tracking-widest font-black text-ink/40">Sales</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-serif font-black text-primary">100%</p>
                    <p className="text-[8px] uppercase tracking-widest font-black text-ink/40">Positive</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bid History Section */}
        {item.listingType === 'auction' && (loadingBids || bids.length > 0) && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-20 md:mt-32 space-y-8 md:space-y-12"
          >
            <div className="flex items-center gap-4 mb-6 md:mb-8">
              <span className="w-8 md:w-12 h-[1px] bg-accent" />
              <h3 className="text-2xl md:text-4xl font-display font-black text-primary uppercase tracking-tighter">Bid History</h3>
            </div>
            <div className="bg-surface rounded-[2rem] md:rounded-[3rem] border border-primary/5 overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
              {loadingBids ? (
                <div className="p-8 space-y-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                      <Skeleton className="h-6 w-24" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Mobile Bid History */}
                  <div className="md:hidden divide-y divide-primary/5">
                    {bids.map((bid) => (
                      <div key={bid.id} className="p-6 space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif italic">
                            {bid.bidderName ? bid.bidderName[0] : 'A'}
                          </div>
                          <div className="flex-1">
                            <span className="font-serif font-black text-primary block">{bid.bidderName || 'Anonymous Collector'}</span>
                            <span className="text-base text-primary/30 font-black uppercase tracking-widest">
                              {bid.timestamp ? format(bid.timestamp.toDate(), 'MMM d, h:mm a') : 'Just now'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-base text-primary/30 uppercase tracking-widest font-black">Valuation</span>
                          <span className="font-serif font-black text-accent text-xl">${bid.amount.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Bid History */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-primary/5 text-ink/80 text-base uppercase tracking-[0.4em] font-black">
                          <th className="p-8">Bidder</th>
                          <th className="p-8">Valuation</th>
                          <th className="p-8 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary/5">
                        {bids.map((bid) => (
                          <tr key={bid.id} className="group hover:bg-surface transition-colors">
                            <td className="p-8">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center text-primary font-serif italic">
                                  {bid.bidderName ? bid.bidderName[0] : 'A'}
                                </div>
                                <span className="font-serif font-black text-primary">{bid.bidderName || 'Anonymous Collector'}</span>
                              </div>
                            </td>
                            <td className="p-8 font-serif font-black text-accent text-xl">
                              ${bid.amount.toLocaleString()}
                            </td>
                            <td className="p-8 text-right text-base font-black uppercase tracking-widest text-primary/30">
                              {bid.timestamp ? format(bid.timestamp.toDate(), 'MMM d, h:mm a') : 'Just now'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Reviews Section */}
        {item.status === 'sold' && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-48 space-y-20"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-primary/5 pb-8 md:pb-12 gap-6">
              <div className="space-y-3 md:space-y-4">
                <div className="flex items-center gap-4">
                  <span className="w-8 h-[1px] bg-accent" />
                  <span className="text-accent text-xs md:text-base font-black tracking-[0.6em] uppercase">Provenance</span>
                </div>
                <h3 className="text-3xl md:text-5xl font-serif font-black text-primary tracking-tighter uppercase">Collector Feedback</h3>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-left md:text-right">
                  <span className="text-[8px] md:text-[10px] font-black tracking-[0.4em] text-primary/20 uppercase block">Average Rating</span>
                  <div className="flex items-center gap-2 justify-start md:justify-end">
                    <Star className="w-3 h-3 md:w-4 md:h-4 text-accent fill-current" />
                    <span className="text-xl md:text-2xl font-serif font-black text-primary">
                      {reviews.length > 0 
                        ? (reviews.reduce((acc, r) => acc + (r.authenticityRating + r.conditionRating + r.sellerExperienceRating) / 3, 0) / reviews.length).toFixed(1)
                        : 'N/A'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              {reviews.map((review) => (
                <motion.div 
                  key={review.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="bg-surface p-12 rounded-[3rem] border border-primary/5 space-y-8 shadow-[0_40px_80px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-accent font-serif italic text-xl">
                        {review.reviewerName[0]}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-primary uppercase tracking-widest">{review.reviewerName}</h4>
                        <p className="text-base text-primary/30 uppercase tracking-widest">{review.timestamp ? format(review.timestamp.toDate(), 'MMMM d, yyyy') : 'Recent'}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star 
                          key={star} 
                          className={cn(
                            "w-3 h-3", 
                            star <= (review.authenticityRating + review.conditionRating + review.sellerExperienceRating) / 3 
                              ? "text-accent fill-current" 
                              : "text-primary/10"
                          )} 
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 md:gap-4 py-4 md:py-6 border-y border-primary/5">
                    <div className="text-center space-y-0.5 md:space-y-1">
                      <span className="text-[8px] md:text-base font-black text-primary/30 uppercase tracking-widest block">Authenticity</span>
                      <span className="text-xs md:text-base font-serif italic text-primary">{review.authenticityRating}/5</span>
                    </div>
                    <div className="text-center space-y-0.5 md:space-y-1">
                      <span className="text-[8px] md:text-base font-black text-primary/30 uppercase tracking-widest block">Condition</span>
                      <span className="text-xs md:text-base font-serif italic text-primary">{review.conditionRating}/5</span>
                    </div>
                    <div className="text-center space-y-0.5 md:space-y-1">
                      <span className="text-[8px] md:text-base font-black text-primary/30 uppercase tracking-widest block">Seller</span>
                      <span className="text-xs md:text-base font-serif italic text-primary">{review.sellerExperienceRating}/5</span>
                    </div>
                  </div>

                  {review.comment && (
                    <p className="text-primary/60 font-serif italic text-lg leading-relaxed">
                      "{review.comment}"
                    </p>
                  )}
                </motion.div>
              ))}
              {reviews.length === 0 && (
                <div className="col-span-full py-20 text-center border border-dashed border-primary/10 rounded-[3rem]">
                  <p className="text-primary/20 font-serif italic text-xl">No feedback has been recorded for this acquisition yet.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Related Items Section */}
        {(loading || relatedItems.length > 0) && (
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-32 md:mt-60 space-y-12 md:space-y-20"
          >
            <div className="flex items-center gap-4 mb-8 md:mb-12">
              <span className="w-8 md:w-12 h-[1px] bg-accent" />
              <h3 className="text-2xl md:text-4xl font-display font-black text-primary uppercase tracking-tighter">Related Pieces</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-12">
              {loading ? (
                [...Array(4)].map((_, i) => <ItemCardSkeleton key={i} />)
              ) : (
                relatedItems.map((relatedItem) => (
                  <ItemCard 
                    key={relatedItem.id} 
                    item={relatedItem} 
                    onClick={() => onItemClick(relatedItem)} 
                    isFavorite={favorites.includes(relatedItem.id)}
                    onToggleFavorite={(e) => onToggleFavorite(relatedItem.id, e)}
                  />
                ))
              )}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {orderConfirmed && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-primary/40 backdrop-blur-xl p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-surface p-20 rounded-[4rem] text-center space-y-10 max-w-lg shadow-[0_100px_200px_rgba(0,0,0,0.5)]"
            >
              <div className="w-32 h-32 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-16 h-16 text-accent" />
              </div>
              <div className="space-y-6">
                <h3 className="text-4xl font-serif font-black text-primary uppercase tracking-tighter">Acquisition Complete</h3>
                <p className="text-primary/60 font-serif italic text-lg leading-relaxed">Your artifact has been secured. Our logistics team will contact you shortly for elite delivery arrangements.</p>
              </div>
              <button 
                onClick={() => {
                  setOrderConfirmed(false);
                  onBack();
                }}
                className="w-full bg-primary text-white py-6 rounded-[2rem] text-base font-black tracking-[0.5em] uppercase hover:bg-accent transition-all duration-700"
              >
                Return to Archives
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AdminOrderCard = ({ item, onRefresh }: { item: AuctionItem, onRefresh?: () => void }) => {
  const [status, setStatus] = useState(item.orderStatus || 'Payment Confirmed');
  const [carrier, setCarrier] = useState(item.trackingCarrier || 'USPS');
  const [customCarrier, setCustomCarrier] = useState('');
  const [trackingNum, setTrackingNum] = useState(item.trackingNumber || '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdateOrder = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const finalCarrier = carrier === 'Custom' ? customCarrier : carrier;
      const finalTrackingLink = trackingNum ? getTrackingLink(finalCarrier, trackingNum) : '';

      // Update in Firestore
      await updateDoc(doc(db, 'items', item.id), {
        orderStatus: status,
        trackingCarrier: finalCarrier,
        trackingNumber: trackingNum,
        trackingLink: finalTrackingLink,
        orderStatusUpdatedAt: new Date().toISOString()
      });

      // Automated email triggers if Shipped or Delivered!
      if ((status === 'Shipped' || status === 'Delivered') && status !== item.orderStatus) {
        const buyerEmail = item.buyerDetails?.email || 'customer@activecollector.com';
        const emailSubject = status === 'Shipped' 
          ? `Dispatched: Your Strawboss Artifact [${item.title}] is on the way!`
          : `Delivered: Your Strawboss Artifact [${item.title}] has been received!`;
        
        let htmlBody = '';
        if (status === 'Shipped') {
          htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
              <h2 style="color: #0f172a; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 2px solid #de1d4f; padding-bottom: 12px; margin-top: 0;">Strawboss Archives Dispatch</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #475569;">We are pleased to inform you that your elite historical acquisition, <strong>${item.title}</strong>, has been verified, secure-packaged, and handed to our premium dispatch couriers.</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 20px; margin: 25px 0;">
                <p style="margin: 0 0 8px 0; color: #de1d4f; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em;">TRACKING & CARRIER INFO</p>
                <p style="margin: 0; color: #0f172a; font-family: monospace; font-size: 14px; font-weight: bold;">${finalCarrier.toUpperCase()} — ${trackingNum}</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${finalTrackingLink}" style="background-color: #0f172a; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; display: inline-block; box-shadow: 0 4px 12px rgba(15,23,42,0.15);">Track Your Dispatch Live</a>
              </div>
              
              <p style="font-size: 12px; line-height: 1.5; color: #64748b;">If you have any specific security or storage instructions for the courier, please contact our administrative desk immediately.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 40px; padding-bottom: 15px;" />
              <p style="color: #94a3b8; font-size: 10px; text-align: center; margin: 0;">© 2026 Strawboss Estate Archives. Private Treaty Acquisitions.</p>
            </div>
          `;
        } else {
          htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; color: #1e293b;">
              <h2 style="color: #0f172a; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-top: 0;">Strawboss Delivery Confirmation</h2>
              <p style="font-size: 15px; line-height: 1.6; color: #475569;">We have received multi-signature courier confirmation that your artifact <strong>${item.title}</strong> has arrived at your secure destination.</p>
              <p style="font-size: 15px; line-height: 1.6; color: #475569;">Please review the provenance document, secure packaging verification seals, and the appraisal certificate enclosed in the package.</p>
              
              <div style="text-align: center; margin: 35px 0;">
                <a href="${window.location.origin}" style="background-color: #10b981; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; display: inline-block; box-shadow: 0 4px 12px rgba(16,185,129,0.15);">Review & Confirm Delivery</a>
              </div>
              
              <p style="font-size: 12px; line-height: 1.5; color: #64748b;">Thank you for consigning and building your modern collection with Strawboss. If you wish to leave seller feedback, please visit your collector profile dashboard.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 40px; padding-bottom: 15px;" />
              <p style="color: #94a3b8; font-size: 10px; text-align: center; margin: 0;">© 2026 Strawboss Estate Archives. Private Treaty Acquisitions.</p>
            </div>
          `;
        }

        // Send actual API POST request to /api/send-email
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: buyerEmail,
            subject: emailSubject,
            html: htmlBody
          })
        });
      }

      setMessage({ type: 'success', text: 'Order status updated successfully and buyer notified!' });
      if (onRefresh) setTimeout(onRefresh, 1000);
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: e.message || 'Failed to update order tracking.' });
    } finally {
      setIsSaving(false);
    }
  };

  const buyer = item.buyerDetails || {};

  return (
    <div className="bg-white rounded-[32px] border border-black/5 p-8 flex flex-col md:grid md:grid-cols-[1.5fr_2fr_2fr] gap-8 shadow-sm hover:shadow-lg transition-all duration-500">
      {/* Col 1: Piece Details */}
      <div className="flex gap-6 items-start">
        <img 
          src={item.images[0]} 
          alt={item.title} 
          className="w-24 h-28 object-cover rounded-2xl shadow-md border"
        />
        <div className="space-y-1">
          <span className="text-[9px] font-black uppercase text-accent bg-accent/5 px-2.5 py-1 rounded-full">{item.category}</span>
          <h4 className="text-base font-serif font-black text-ink line-clamp-2 pt-1.5 leading-tight">{item.title}</h4>
          <p className="text-sm font-mono font-bold text-ink/70 pt-1">${(item.currentBid || item.price || 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Col 2: Buyer Details */}
      <div className="space-y-3 bg-zinc-50/50 p-6 rounded-2xl border border-black/[0.02]">
        <span className="text-[9px] font-black uppercase tracking-widest text-ink/40">Buyer Passport & Address</span>
        <div className="space-y-2 text-xs">
          <p className="font-bold text-primary">{buyer.fullName || 'Anonymous Collector'}</p>
          <p className="text-zinc-500"><span className="text-zinc-400">Email:</span> {buyer.email || 'N/A'}</p>
          <p className="text-zinc-500"><span className="text-zinc-400">Phone:</span> {buyer.phone || 'N/A'}</p>
          <p className="text-zinc-600 leading-relaxed"><span className="text-zinc-400">Ship To:</span> <br/>{buyer.address || 'N/A'}, {buyer.city || ''}</p>
        </div>
      </div>

      {/* Col 3: Courier Tracking Form */}
      <div className="space-y-4 flex flex-col justify-between">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Dispatch Status</label>
            <select 
              value={status}
              onChange={e => setStatus(e.target.value as any)}
              className="w-full bg-paper py-3 px-4 rounded-xl border border-black/5 text-xs outline-none focus:ring-1 focus:ring-accent font-bold"
            >
              <option value="Payment Confirmed">Payment Confirmed</option>
              <option value="Processing">Processing</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Courier Carrier</label>
            <select 
              value={carrier}
              onChange={e => setCarrier(e.target.value)}
              className="w-full bg-paper py-3 px-4 rounded-xl border border-black/5 text-xs outline-none focus:ring-1 focus:ring-accent font-bold"
            >
              <option value="USPS">USPS Express</option>
              <option value="FedEx">FedEx International</option>
              <option value="UPS">UPS Worldwide</option>
              <option value="DHL">DHL Express</option>
              <option value="AfterShip">AfterShip Tracker</option>
              <option value="Shippo">Shippo Services</option>
              <option value="Custom">Custom Carrier</option>
            </select>
          </div>
        </div>

        {carrier === 'Custom' && (
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Custom Carrier Name</label>
            <input 
              type="text" 
              value={customCarrier}
              onChange={e => setCustomCarrier(e.target.value)}
              placeholder="E.g. Royal Mail, Aramex"
              className="w-full bg-paper py-3 px-4 rounded-xl border border-black/5 text-xs outline-none focus:ring-1 focus:ring-accent font-semibold"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Courier Tracking Number</label>
          <input 
            type="text" 
            value={trackingNum}
            onChange={e => setTrackingNum(e.target.value)}
            placeholder="E.g. 1Z999AA10123456784"
            className="w-full bg-paper py-3 px-4 rounded-xl border border-black/5 text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {message && (
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-wider text-center p-2 rounded-lg",
            message.type === 'success' ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          )}>
            {message.text}
          </p>
        )}

        <button
          onClick={handleUpdateOrder}
          disabled={isSaving}
          className="w-full py-4 bg-primary text-white text-[10px] uppercase font-black tracking-widest hover:bg-accent disabled:opacity-50 transition-colors shadow-md rounded-xl"
        >
          {isSaving ? "Publishing Dispatch..." : "Confirm & Notify Customer"}
        </button>
      </div>
    </div>
  );
};

const AdminPanel = ({ 
  items, 
  onDelete,
  featuredImageUrl,
  onUpdateFeaturedImage,
  onAdd,
  onEdit,
  loading,
  onRefresh
}: { 
  items: AuctionItem[], 
  onDelete: (id: string) => void,
  featuredImageUrl: string,
  onUpdateFeaturedImage: (url: string) => void,
  onAdd: () => void,
  onEdit: (item: AuctionItem) => void,
  loading?: boolean,
  onRefresh?: () => void
}) => {
  const [newUrl, setNewUrl] = useState(featuredImageUrl);
  const [activeTab, setActiveTab] = useState<'inventory' | 'settings' | 'orders'>('inventory');

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-32 space-y-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-8 border-b border-black/5 pb-12">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="w-12 h-[1px] bg-accent" />
            <span className="text-accent text-xs font-black tracking-[0.6em] uppercase">Administrative Control</span>
          </div>
          <h2 className="text-5xl md:text-7xl font-serif font-black text-ink uppercase tracking-tighter">
            Admin <span className="italic font-extralight text-ink/40 lowercase">panel</span>
          </h2>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <button 
            onClick={() => setActiveTab('inventory')}
            className={cn(
              "px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500",
              activeTab === 'inventory' ? "bg-primary text-white shadow-2xl" : "bg-white text-primary border border-black/5 hover:bg-black/5"
            )}
          >
            Manage Inventory
          </button>
          <button 
            onClick={() => setActiveTab('orders')}
            className={cn(
              "px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500",
              activeTab === 'orders' ? "bg-primary text-white shadow-2xl" : "bg-white text-primary border border-black/5 hover:bg-black/5"
            )}
          >
            Manage Orders Tracking
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn(
              "px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-500",
              activeTab === 'settings' ? "bg-primary text-white shadow-2xl" : "bg-white text-primary border border-black/5 hover:bg-black/5"
            )}
          >
            Site Settings
          </button>
        </div>
      </div>

      {activeTab === 'settings' ? (
        <div className="bg-white p-12 rounded-[40px] shadow-[0_40px_100px_rgba(0,0,0,0.1)] border border-black/5 space-y-8">
          <div className="flex items-center gap-4">
            <span className="w-8 h-[1px] bg-accent" />
            <span className="text-base font-black uppercase tracking-[0.4em] text-accent">Hero Background Settings</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-end">
            <div className="space-y-4">
              <label className="text-base uppercase tracking-[0.3em] font-black text-primary/30">Hero Background Image URL</label>
              <input 
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="w-full bg-paper py-4 px-6 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 transition-all font-mono text-base border border-black/5"
                placeholder="Enter high-res image URL..."
              />
            </div>
            <button 
              onClick={() => onUpdateFeaturedImage(newUrl)}
              className="bg-primary text-white px-10 py-4 rounded-xl text-base font-black tracking-widest uppercase hover:bg-accent transition-all shadow-lg"
            >
              Update Background
            </button>
          </div>
        </div>
      ) : activeTab === 'orders' ? (
        <div className="space-y-12">
          <div className="flex justify-between items-center pb-4 border-b">
            <div>
              <h3 className="text-2xl font-serif font-black text-ink uppercase tracking-tight">Active Dispatches</h3>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-1">Manage and track courier transit of sold legacy items.</p>
            </div>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-400 bg-zinc-100 px-4 py-2 rounded-full">
              {items.filter(item => item.status === 'sold').length} Total Sold
            </span>
          </div>

          <div className="space-y-8">
            {items.filter(item => item.status === 'sold').length === 0 ? (
              <div className="bg-white rounded-[32px] p-20 text-center border-2 border-dashed border-zinc-200">
                <Package className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <p className="text-zinc-500 font-bold uppercase tracking-widest text-sm">No items have been acquired yet.</p>
                <p className="text-zinc-400 text-xs mt-1">Sold pieces will automatically appear here for white-glove transit coordination.</p>
              </div>
            ) : (
              items.filter(item => item.status === 'sold').map(item => (
                <AdminOrderCard key={item.id} item={item} onRefresh={onRefresh} />
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-serif font-black text-ink uppercase tracking-tight">Current Inventory</h3>
            <button 
              onClick={onAdd}
              className="bg-primary text-white px-8 py-4 rounded-2xl text-xs font-black tracking-widest uppercase hover:bg-accent transition-all shadow-xl flex items-center gap-4"
            >
              <Plus className="w-4 h-4" />
              Add New Piece
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {items.map(item => (
              <div key={item.id} className="group relative bg-white rounded-[32px] overflow-hidden border border-black/5 shadow-sm hover:shadow-2xl transition-all duration-700">
                <div className="aspect-[4/5] overflow-hidden">
                  <img 
                    src={item.images[0]} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center justify-center gap-4">
                    <button 
                      onClick={() => onEdit(item)}
                      className="bg-white text-primary p-4 rounded-full hover:bg-accent hover:text-white transition-colors"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => onDelete(item.id)}
                      className="bg-white text-primary p-4 rounded-full hover:bg-red-500 hover:text-white transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-8 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent">{item.category}</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-ink/40">{item.listingType}</span>
                  </div>
                  <h3 className="text-xl font-serif font-black text-ink line-clamp-1">{item.title}</h3>
                  <p className="text-lg font-serif italic text-primary">
                    {item.listingType === 'buy-now' ? `$${item.price?.toLocaleString()}` : `Current: $${item.currentBid?.toLocaleString()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ReviewsSection = () => {
  const reviews = [
    {
      id: 1,
      name: "Julian Vane",
      role: "Private Collector",
      content: "The level of curation at Strawboss is expert. Every acquisition feels like a piece of history coming home.",
      rating: 5,
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Julian"
    },
    {
      id: 2,
      name: "Elena Rossi",
      role: "Art Historian",
      content: "Finally, a platform that respects the provenance and soul of antiquities. Their authentication process is rigorous.",
      rating: 5,
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Elena"
    },
    {
      id: 3,
      name: "Marcus Thorne",
      role: "Estate Manager",
      content: "Consigning with Strawboss was seamless. They found the right buyer who truly appreciates the value of my collection.",
      rating: 5,
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus"
    }
  ];

  return (
    <section className="py-24 md:py-40 px-4 md:px-6 bg-paper text-primary overflow-hidden relative">
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {reviews.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.8 }}
              viewport={{ once: true }}
              className="bg-surface p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] border border-primary/5 relative group shadow-sm hover:shadow-[0_40px_80px_rgba(0,0,0,0.5)] transition-all duration-700"
            >
              <div className="space-y-6 md:space-y-8">
                <div className="flex gap-1">
                  {[...Array(review.rating)].map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 bg-primary rounded-full" />
                  ))}
                </div>
                
                <p className="text-base font-serif italic leading-relaxed text-primary/80">
                  "{review.content}"
                </p>

                <div className="flex items-center gap-4 md:gap-5 pt-6 md:pt-8 border-t border-primary/5">
                  <LazyImage 
                    src={review.avatar} 
                    alt={review.name} 
                    className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-primary/5 border border-primary/5"
                  />
                  <div>
                    <h4 className="text-base font-black uppercase tracking-widest text-primary">{review.name}</h4>
                    <p className="text-base font-serif italic text-ink/80">{review.role}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const CheckoutModal = ({ item, user, onCancel, onConfirm }: { item: AuctionItem, user: User, onCancel: () => void, onConfirm: (details: any) => void }) => {
  const [details, setDetails] = useState({
    fullName: user.displayName || '',
    email: user.email || '',
    address: '',
    city: '',
    phone: '',
    paymentMethod: 'paypal' as 'paypal' | 'card'
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'info' | 'confirm'>('info');

  const shippingFee = 0; 
  const itemPrice = item.price || item.currentBid || 0;
  const totalCost = itemPrice + shippingFee;

  const isFormValid = details.fullName && details.address && details.city && details.phone;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-surface w-full max-w-lg rounded-[2rem] md:rounded-[3rem] shadow-[0_80px_160px_rgba(0,0,0,0.5)] overflow-hidden max-h-[95vh] overflow-y-auto p-6 md:p-12 space-y-6 md:space-y-12 border border-primary/5"
      >
        <div className="flex justify-between items-center border-b border-primary/5 pb-4 md:pb-8">
          <h3 className="text-xl md:text-3xl font-serif font-black text-primary tracking-tighter uppercase">
            {step === 'info' ? 'Acquisition' : 'Review'}
          </h3>
          <button onClick={onCancel} className="text-primary/20 hover:text-accent transition-colors">
            <X className="w-6 h-6 md:w-8 md:h-8" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {step === 'info' ? (
            <motion.div 
              key="info"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6 md:space-y-10"
            >
              <div className="flex gap-4 md:gap-6 items-center bg-primary/[0.02] p-3 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-primary/5">
                <img src={item.images[0]} alt={item.title} className="w-12 h-12 md:w-24 md:h-24 object-cover rounded-lg md:rounded-2xl" />
                <div>
                  <h4 className="text-sm md:text-lg font-serif font-black text-primary tracking-tight uppercase line-clamp-1">{item.title}</h4>
                  <p className="text-accent text-[10px] md:text-sm font-black tracking-widest uppercase mt-0.5 md:mt-1">${itemPrice.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-4 md:space-y-6">
                <div className="space-y-1.5 md:space-y-2">
                  <label className="text-[10px] md:text-base font-black uppercase tracking-widest text-ink/80 ml-2 md:ml-4">Full Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-primary/[0.02] border border-primary/5 rounded-xl md:rounded-2xl py-3 md:py-5 px-4 md:px-8 outline-none focus:border-accent transition-all text-primary font-serif italic text-sm md:text-base"
                    placeholder="Julian Vane"
                    value={details.fullName}
                    onChange={e => setDetails({...details, fullName: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5 md:space-y-2">
                  <label className="text-[10px] md:text-base font-black uppercase tracking-widest text-ink/80 ml-2 md:ml-4">Shipping Address</label>
                  <textarea 
                    rows={2}
                    className="w-full bg-primary/[0.02] border border-primary/5 rounded-xl md:rounded-2xl py-3 md:py-5 px-4 md:px-8 outline-none focus:border-accent transition-all resize-none text-primary font-serif italic text-sm md:text-base"
                    placeholder="123 Heritage Lane, London"
                    value={details.address}
                    onChange={e => setDetails({...details, address: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="text-[10px] md:text-base font-black uppercase tracking-widest text-ink/80 ml-2 md:ml-4">City</label>
                    <input 
                      type="text" 
                      className="w-full bg-primary/[0.02] border border-primary/5 rounded-xl md:rounded-2xl py-3 md:py-5 px-4 md:px-8 outline-none focus:border-accent transition-all text-primary font-serif italic text-sm md:text-base"
                      placeholder="London"
                      value={details.city}
                      onChange={e => setDetails({...details, city: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1.5 md:space-y-2">
                    <label className="text-[10px] md:text-base font-black uppercase tracking-widest text-ink/80 ml-2 md:ml-4">Phone</label>
                    <input 
                      type="text" 
                      className="w-full bg-primary/[0.02] border border-primary/5 rounded-xl md:rounded-2xl py-3 md:py-5 px-4 md:px-8 outline-none focus:border-accent transition-all text-primary font-serif italic text-sm md:text-base"
                      placeholder="+44 20 7123 4567"
                      value={details.phone}
                      onChange={e => setDetails({...details, phone: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:space-y-6">
                <p className="text-[10px] md:text-base font-black uppercase tracking-widest text-ink/80 ml-2 md:ml-4">Payment Method</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <button 
                    onClick={() => setDetails({...details, paymentMethod: 'paypal'})}
                    className={`py-4 md:py-6 rounded-2xl border transition-all text-sm md:text-base font-black tracking-widest uppercase ${details.paymentMethod === 'paypal' ? 'border-accent bg-accent/5 text-accent' : 'border-primary/5 text-primary/20 hover:border-primary/20'}`}
                  >
                    PayPal
                  </button>
                  <button 
                    onClick={() => setDetails({...details, paymentMethod: 'card'})}
                    className={`py-4 md:py-6 rounded-2xl border transition-all text-sm md:text-base font-black tracking-widest uppercase ${details.paymentMethod === 'card' ? 'border-accent bg-accent/5 text-accent' : 'border-primary/5 text-primary/20 hover:border-primary/20'}`}
                  >
                    Credit Card
                  </button>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                disabled={!isFormValid}
                onClick={() => setStep('confirm')}
                className="w-full bg-primary text-white py-6 md:py-8 rounded-2xl text-sm md:text-base font-black tracking-[0.4em] uppercase hover:bg-accent transition-all duration-700 disabled:opacity-50 shadow-[0_40px_80px_rgba(0,31,63,0.2)]"
              >
                Review Acquisition
              </motion.button>
            </motion.div>
          ) : (
            <motion.div 
              key="confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8 md:space-y-10"
            >
              <div className="space-y-6">
                <div className="bg-primary/[0.02] p-6 rounded-[2rem] border border-primary/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-primary/40">Piece</span>
                    <span className="text-sm font-serif italic text-primary">{item.title}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-primary/40">Acquisition Price</span>
                    <span className="text-sm font-serif italic text-primary">${itemPrice.toLocaleString()}</span>
                  </div>
                  <div className="pt-4 border-t border-primary/10 flex justify-between items-center">
                    <span className="text-sm font-black uppercase tracking-widest text-accent">Total Investment</span>
                    <span className="text-xl font-serif font-black text-accent">${totalCost.toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-primary/[0.02] p-6 rounded-[2rem] border border-primary/5 space-y-4">
                  <h5 className="text-xs font-black uppercase tracking-widest text-primary/40">Shipping Destination</h5>
                  <div className="space-y-1">
                    <p className="text-sm font-serif italic text-primary">{details.fullName}</p>
                    <p className="text-sm font-serif italic text-primary/60">{details.address}</p>
                    <p className="text-sm font-serif italic text-primary/60">{details.city}</p>
                    <p className="text-sm font-serif italic text-primary/60">{details.phone}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {details.paymentMethod === 'paypal' ? (
                  <PayPalButtons 
                    style={{ layout: "vertical", shape: "rect", label: "pay" }}
                    createOrder={(data, actions) => {
                      return actions.order.create({
                        intent: "CAPTURE",
                        purchase_units: [
                          {
                            amount: {
                              currency_code: "USD",
                              value: totalCost.toString(),
                            },
                            description: `Acquisition of ${item.title}`
                          },
                        ],
                      });
                    }}
                    onApprove={async (data, actions) => {
                      if (actions.order) {
                        const order = await actions.order.capture();
                        onConfirm({ ...details, paypalOrder: order, totalCost });
                      }
                    }}
                  />
                ) : (
                  <motion.button 
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isProcessing}
                    onClick={() => {
                      setIsProcessing(true);
                      setTimeout(() => {
                        onConfirm({ ...details, totalCost });
                        setIsProcessing(false);
                      }, 2000);
                    }}
                    className="w-full bg-primary text-white py-6 md:py-8 rounded-2xl text-sm md:text-base font-black tracking-[0.4em] uppercase hover:bg-accent transition-all duration-700 disabled:opacity-50 shadow-[0_40px_80px_rgba(0,31,63,0.2)]"
                  >
                    {isProcessing ? 'Processing...' : 'Confirm Acquisition'}
                  </motion.button>
                )}
                
                <button 
                  onClick={() => setStep('info')}
                  className="w-full text-primary/40 hover:text-primary text-xs font-black uppercase tracking-widest transition-colors py-2"
                >
                  Edit Details
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

const AboutSection = () => {
  const [activeStep, setActiveStep] = useState(0);
  const steps = [
    { title: "Sourcing", desc: "Our curators travel the globe to find pieces with undeniable provenance and historical weight." },
    { title: "Authentication", desc: "Every artifact undergoes rigorous scientific and historical verification by our elite appraisal team." },
    { title: "Valuation", desc: "We establish fair market reserves based on rarity, condition, and recent global auction trends." },
    { title: "Acquisition", desc: "Secure your piece through our high-stakes digital auction or exclusive private treaty sales." }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [steps.length]);

  return (
    <section id="about" className="py-24 md:py-60 px-4 md:px-12 bg-paper overflow-hidden">
      <div className="max-w-[1800px] mx-auto grid lg:grid-cols-2 gap-24 items-center">
        <div className="space-y-16">
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <span className="w-12 h-[1px] bg-black" />
              <span className="text-primary text-base font-black tracking-[0.6em] uppercase">Our Heritage</span>
            </div>
            <h3 className="text-4xl md:text-7xl font-serif font-black text-primary leading-[0.85] tracking-tighter uppercase">
              A Legacy of <br />
              <span className="italic font-extralight text-ink/40 lowercase">curation</span>
            </h3>
            <p className="text-lg md:text-2xl font-serif italic text-primary/60 max-w-lg leading-relaxed">
              Founded in the pursuit of the extraordinary, Strawboss Elite Auctions has served the world's most discerning collectors for decades.
            </p>
          </div>

          {/* 3D Rotating Steps */}
          <div className="relative min-h-[300px] md:h-[300px] perspective-[1000px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, rotateX: -90, y: 50 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={{ opacity: 0, rotateX: 90, y: -50 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 flex flex-col justify-center space-y-6 bg-primary/5 p-12 rounded-[3rem] border border-primary/5"
              >
                <div className="flex items-center gap-6">
                  <span className="text-6xl font-serif font-black text-accent/20">0{activeStep + 1}</span>
                  <h4 className="text-3xl font-serif font-black text-primary uppercase tracking-tighter">{steps[activeStep].title}</h4>
                </div>
                <p className="text-xl font-serif italic text-primary/60 leading-relaxed">
                  {steps[activeStep].desc}
                </p>
              </motion.div>
            </AnimatePresence>
            
            <div className="absolute bottom-[-40px] left-12 flex gap-4">
              {steps.map((_, i) => (
                <button 
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={cn(
                    "w-12 h-1.5 rounded-full transition-all duration-500",
                    activeStep === i ? "bg-accent w-24" : "bg-primary/10 hover:bg-primary/20"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <motion.div 
            animate={{ 
              y: [0, -20, 0],
              rotate: [0, 2, 0]
            }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="relative aspect-square rounded-[4rem] overflow-hidden shadow-[0_80px_160px_rgba(0,0,0,0.2)]"
          >
            <LazyImage 
              src="https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=1000" 
              alt="Curation"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-accent/10 mix-blend-overlay" />
          </motion.div>
          
          {/* Floating 3D Elements */}
          <motion.div 
            animate={{ 
              rotate: 360,
              scale: [1, 1.1, 1]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-12 -right-12 w-48 h-48 border border-accent/20 rounded-full flex items-center justify-center backdrop-blur-sm"
          >
            <div className="w-40 h-40 border border-accent/10 rounded-full flex items-center justify-center">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent animate-pulse">Elite Certified</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const Footer = ({ onNewsletterSubmit, showSuccess, featuredImageUrl, user, setView, isAdmin }: { onNewsletterSubmit: (e: React.FormEvent) => void, showSuccess: boolean, featuredImageUrl: string, user: User | null, setView: (v: string) => void, isAdmin: boolean }) => (
  <footer className="bg-paper text-primary py-32 px-8 border-t border-primary/5 relative overflow-hidden">
    {/* Rotating Gavel Background */}
    <div className="absolute -bottom-20 -right-20 opacity-[0.02] pointer-events-none">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      >
        <Gavel className="w-[600px] h-[600px]" />
      </motion.div>
    </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 md:gap-20 mb-20 md:mb-24">
          <div className="col-span-1 md:col-span-2 space-y-6 md:space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/5">
                <LazyImage 
                  src={featuredImageUrl} 
                  alt="Logo" 
                  imgClassName="object-contain"
                  loading="eager"
                />
              </div>
              <h3 className="text-xl font-serif font-black uppercase tracking-tighter">Strawboss</h3>
            </div>
            <p className="text-ink/80 text-sm max-w-sm leading-relaxed font-serif italic">
              Est. 1992. The global standard for authenticated elite auctions and private treaties. Built on trust, provenance, and worldwide white-glove expertise.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 gap-12 md:gap-20 col-span-1 md:col-span-2">
            <div className="space-y-6">
              <h4 className="text-sm md:text-base font-black uppercase tracking-widest text-primary">Catalogues</h4>
              <ul className="space-y-3 md:space-y-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-ink/80">
                <li><button onClick={() => setView('marketplace')} className="hover:text-primary transition-colors">Antiques</button></li>
                <li><button onClick={() => setView('marketplace')} className="hover:text-primary transition-colors">Collection</button></li>
                <li><button onClick={() => setView('marketplace')} className="hover:text-primary transition-colors">Live Auctions</button></li>
                <li><button onClick={() => setView('marketplace')} className="hover:text-primary transition-colors">New Acquisitions</button></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-sm md:text-base font-black uppercase tracking-widest text-primary">Services</h4>
              <ul className="space-y-3 md:space-y-4 text-[10px] md:text-xs font-black uppercase tracking-widest text-ink/80">
                <li><button className="hover:text-primary transition-colors">Private Treaty</button></li>
                <li><button className="hover:text-primary transition-colors">White-Glove Delivery</button></li>
                <li><button className="hover:text-primary transition-colors">Contact</button></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-12 border-t border-primary/5 flex flex-col md:flex-row justify-between items-center gap-6 md:gap-8 text-[10px] md:text-base font-black uppercase tracking-[0.3em] text-primary/20 text-center md:text-left">
          <span>© 2024 Strawboss Elite Auctions Ltd.</span>
          <div className="flex gap-6 md:gap-10">
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Cookies</a>
          </div>
        </div>
      </div>

  </footer>
);

const Dashboard = ({ 
  user, 
  userProfile, 
  favorites, 
  consignments, 
  acquisitions, 
  onUpdateProfile,
  onItemClick,
  onToggleFavorite
}: { 
  user: User, 
  userProfile: UserProfile, 
  favorites: AuctionItem[], 
  consignments: AuctionItem[], 
  acquisitions: AuctionItem[], 
  onUpdateProfile: (data: Partial<UserProfile>) => Promise<void>,
  onItemClick: (item: AuctionItem) => void,
  onToggleFavorite: (item: AuctionItem) => void
}) => {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'consignments' | 'acquisitions' | 'profile'>('watchlist');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    displayName: userProfile.displayName,
    bio: userProfile.bio || '',
    location: userProfile.location || '',
    externalCollectionUrl: userProfile.externalCollectionUrl || ''
  });

  const handleUpdate = async () => {
    await onUpdateProfile(editData);
    setIsEditing(false);
  };

  const tabs = [
    { id: 'watchlist', label: 'Watchlist', icon: Heart, count: favorites.length },
    { id: 'consignments', label: 'Consignments', icon: Tag, count: consignments.length },
    { id: 'acquisitions', label: 'Acquisitions', icon: Package, count: acquisitions.length },
    { id: 'profile', label: 'Profile', icon: Settings, count: null }
  ];

  return (
    <div className="min-h-screen bg-paper pt-32 pb-20 px-4 md:px-12">
      <div className="max-w-[1800px] mx-auto space-y-12 md:space-y-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="w-12 h-[1px] bg-black" />
              <span className="text-primary text-base font-black tracking-[0.6em] uppercase">Collector Dashboard</span>
            </div>
            <div className="flex items-center gap-8">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white shadow-2xl">
                <img src={userProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt={userProfile.displayName} className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-4xl md:text-6xl font-serif font-black text-primary tracking-tighter uppercase leading-none">
                  {userProfile.displayName}
                </h2>
                <p className="text-accent text-xs md:text-sm font-black tracking-[0.4em] uppercase mt-4">
                  Elite Member • Joined {userProfile.createdAt ? format(userProfile.createdAt.toDate(), 'MMMM yyyy') : 'Recently'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto pb-4 -mb-4 no-scrollbar gap-3 md:gap-4 border-b border-primary/5">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 md:gap-3 px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all duration-500 whitespace-nowrap",
                activeTab === tab.id 
                  ? "bg-primary text-white shadow-xl scale-105" 
                  : "bg-white text-primary/40 hover:bg-primary/5 hover:text-primary"
              )}
            >
              <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {tab.label}
              {tab.count !== null && (
                <span className={cn(
                  "ml-1 md:ml-2 px-1.5 md:px-2 py-0.5 rounded-full text-[8px] md:text-[10px]",
                  activeTab === tab.id ? "bg-white/20 text-white" : "bg-primary/5 text-primary/40"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-[400px]"
          >
            {activeTab === 'profile' ? (
              <div className="max-w-4xl bg-white rounded-[3rem] border border-primary/5 p-8 md:p-16 shadow-sm space-y-12">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-serif font-black text-primary uppercase tracking-tight">Curator Profile</h3>
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs font-black uppercase tracking-widest text-accent hover:text-primary transition-colors"
                  >
                    {isEditing ? 'Cancel' : 'Edit Profile'}
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Display Name</label>
                      {isEditing ? (
                        <input 
                          className="input-field"
                          value={editData.displayName}
                          onChange={e => setEditData({...editData, displayName: e.target.value})}
                        />
                      ) : (
                        <p className="text-lg font-serif italic text-primary">{userProfile.displayName}</p>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Location</label>
                      {isEditing ? (
                        <input 
                          className="input-field"
                          value={editData.location}
                          onChange={e => setEditData({...editData, location: e.target.value})}
                          placeholder="e.g. London, UK"
                        />
                      ) : (
                        <p className="text-lg font-serif italic text-primary">{userProfile.location || 'Not specified'}</p>
                      )}
                    </div>
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">External Collection</label>
                      {isEditing ? (
                        <input 
                          className="input-field"
                          value={editData.externalCollectionUrl}
                          onChange={e => setEditData({...editData, externalCollectionUrl: e.target.value})}
                          placeholder="Link to your digital gallery"
                        />
                      ) : (
                        <p className="text-lg font-serif italic text-primary truncate max-w-xs">{userProfile.externalCollectionUrl || 'No collection linked'}</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Collector Bio</label>
                      {isEditing ? (
                        <textarea 
                          className="input-field min-h-[150px] resize-none"
                          value={editData.bio}
                          onChange={e => setEditData({...editData, bio: e.target.value})}
                          placeholder="Tell us about your collection interests..."
                        />
                      ) : (
                        <p className="text-lg font-serif italic text-primary leading-relaxed">{userProfile.bio || 'No bio provided.'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleUpdate}
                    className="w-full bg-primary text-white py-6 rounded-2xl text-xs font-black uppercase tracking-[0.4em] shadow-xl hover:bg-accent transition-all duration-500"
                  >
                    Save Changes
                  </motion.button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 md:gap-12">
                {activeTab === 'watchlist' && (
                  favorites.length > 0 ? (
                    favorites.map(item => (
                      <ItemCard 
                        key={item.id} 
                        item={item} 
                        onClick={() => onItemClick(item)} 
                        isFavorite={true}
                        onToggleFavorite={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(item);
                        }}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-32 text-center space-y-6">
                      <Heart className="w-16 h-16 text-primary/5 mx-auto" />
                      <p className="text-sm font-black uppercase tracking-[0.4em] text-primary/20">Your watchlist is empty</p>
                    </div>
                  )
                )}
                {activeTab === 'consignments' && (
                  consignments.length > 0 ? (
                    consignments.map(item => (
                      <ItemCard 
                        key={item.id} 
                        item={item} 
                        onClick={() => onItemClick(item)} 
                        isFavorite={false}
                        onToggleFavorite={(e) => e.stopPropagation()}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-32 text-center space-y-6">
                      <Tag className="w-16 h-16 text-primary/5 mx-auto" />
                      <p className="text-sm font-black uppercase tracking-[0.4em] text-primary/20">No active consignments</p>
                    </div>
                  )
                )}
                {activeTab === 'acquisitions' && (
                  acquisitions.length > 0 ? (
                    acquisitions.map(item => (
                      <ItemCard 
                        key={item.id} 
                        item={item} 
                        onClick={() => onItemClick(item)} 
                        isFavorite={false}
                        onToggleFavorite={(e) => e.stopPropagation()}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-32 text-center space-y-6">
                      <Package className="w-16 h-16 text-primary/5 mx-auto" />
                      <p className="text-sm font-black uppercase tracking-[0.4em] text-primary/20">No artifacts acquired yet</p>
                    </div>
                  )
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

const ConfirmationModal = ({ 
  title, 
  message, 
  onConfirm, 
  onCancel 
}: { 
  title: string, 
  message: string, 
  onConfirm: () => void, 
  onCancel: () => void 
}) => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-primary/40 backdrop-blur-2xl"
  >
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-surface w-full max-w-md rounded-[2.5rem] shadow-[0_80px_160px_rgba(0,0,0,0.5)] p-10 space-y-8 border border-white/10"
      >
      <div className="space-y-4 text-center">
        <h3 className="text-2xl font-serif font-black text-primary uppercase tracking-tight">{title}</h3>
        <p className="text-primary/60 font-serif italic">{message}</p>
      </div>
      <div className="flex gap-4">
        <button 
          onClick={onCancel}
          className="flex-1 py-4 rounded-xl text-xs font-black uppercase tracking-widest text-primary/40 hover:text-primary transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={onConfirm}
          className="flex-1 bg-red-500 text-white py-4 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-500/20"
        >
          Confirm
        </button>
      </div>
    </motion.div>
  </motion.div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('home'); // home, marketplace, sell, detail, admin
  const [selectedItem, setSelectedItem] = useState<AuctionItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>(['Victorian', 'Ancient Greek', 'Edo Period']);
  const [showHistory, setShowHistory] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [newsletterSuccess, setNewsletterSuccess] = useState(false);
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showReviewModal, setShowReviewModal] = useState<AuctionItem | null>(null);
  const [editingItem, setEditingItem] = useState<AuctionItem | null>(null);
  const [showConsignModal, setShowConsignModal] = useState(false);
  const [featuredImageUrl, setFeaturedImageUrl] = useState('https://cdn.phototourl.com/free/2026-03-29-b481a076-2cd6-46c5-8ae2-52e9b8c433a5.jpg');
  const [showToast, setShowToast] = useState(false);
  const [appError, setAppError] = useState<Error | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high'>('newest');
  const [printSelectedIds, setPrintSelectedIds] = useState<string[]>([]);

  const handlePrintCatalog = () => {
    const selectedItems = items.filter(item => printSelectedIds.includes(item.id));
    if (selectedItems.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to open printed catalog brochure.");
      return;
    }

    const itemsHtml = selectedItems.map(item => `
      <div class="item">
        <div class="image-container">
          <img src="${item.images[0]}" alt="${item.title}" />
        </div>
        <div class="details">
          <div class="category">${item.category.toUpperCase()}</div>
          <h2 class="title">${item.title}</h2>
          <p class="description">${item.description}</p>
          <div class="valuation">
            <span class="label">${item.listingType === 'auction' ? 'HISTORIC VALUATION' : 'PRIVATE TREATY APPRAISAL'}</span>
            <span class="value">$${(item.listingType === 'auction' ? (item.currentBid || item.price) : item.price)?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    `).join('<hr class="divider"/>');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Strawboss Estate Archives — Curated Collection Catalog</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;600&display=swap');
            body {
              font-family: 'Inter', sans-serif;
              color: #1a1a1a;
              background-color: #ffffff;
              margin: 40px;
              line-height: 1.6;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #de1d4f;
              padding-bottom: 30px;
              margin-bottom: 50px;
            }
            .brand {
              font-family: 'Playfair Display', serif;
              font-size: 32px;
              font-weight: 700;
              letter-spacing: -0.02em;
              text-transform: uppercase;
              margin: 0;
            }
            .title-italics {
              font-style: italic;
              font-weight: 300;
              text-transform: lowercase;
            }
            .subtitle {
              font-size: 10px;
              font-weight: 600;
              letter-spacing: 0.4em;
              text-transform: uppercase;
              color: #666;
              margin-top: 8px;
            }
            .timestamp {
              font-size: 9px;
              color: #999;
              margin-top: 15px;
              font-family: monospace;
            }
            .item {
              display: grid;
              grid-template-columns: 1fr 2fr;
              gap: 40px;
              margin-bottom: 40px;
              page-break-inside: avoid;
            }
            .image-container img {
              width: 100%;
              max-height: 380px;
              object-fit: cover;
              border: 1px solid #eee;
            }
            .category {
              font-size: 9px;
              font-weight: 600;
              letter-spacing: 0.3em;
              color: #de1d4f;
              margin-bottom: 10px;
            }
            .title {
              font-family: 'Playfair Display', serif;
              font-size: 24px;
              font-weight: 700;
              margin-top: 0;
              margin-bottom: 15px;
              line-height: 1.2;
            }
            .description {
              font-size: 11px;
              color: #444;
              margin-bottom: 25px;
              text-align: justify;
            }
            .valuation {
              background-color: #fcfcfc;
              border: 1px solid #f0f0f0;
              padding: 20px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .valuation .label {
              font-size: 9px;
              font-weight: 600;
              letter-spacing: 0.2em;
              color: #888;
            }
            .valuation .value {
              font-size: 20px;
              font-weight: 600;
              font-family: 'Playfair Display', serif;
            }
            .divider {
              border: 0;
              border-top: 1px solid #eee;
              margin: 40px 0;
            }
            .footer {
              text-align: center;
              font-size: 9px;
              color: #999;
              margin-top: 80px;
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
            @media print {
              body { margin: 20px; }
              hr.divider { margin: 30px 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="brand">Strawboss Estate Archives</h1>
            <div class="subtitle">Private treaty & curated collections catalog</div>
            <div class="timestamp">GENERATED ON ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
          
          <div class="items-list">
            ${itemsHtml}
          </div>

          <div class="footer">
            CONFIDENTIAL ARCHIVAL PREVIEW. ALL RIGHTS RESERVED. STRAWBOSS ESTATE © 2026.
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const isAdmin = userProfile?.role === 'admin' || user?.email === 'smubasshir532@gmail.com';

  // Gracefully handle appError in-line inside the UI rather than throwing and crashing the entire React tree.

  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'featured');
    return onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        setFeaturedImageUrl(doc.data().url);
      }
    }, (error) => {
      // Gracefully handle quota errors for non-critical settings
      if (error.message?.includes('Quota limit exceeded')) {
        console.warn('Quota limit exceeded for settings/featured. Using default image.');
      } else {
        setAppError(handleFirestoreError(error, OperationType.GET, 'settings/featured'));
      }
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setUserProfile(null);
        setFavorites([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfile;
          setUserProfile(data);
          setFavorites(data.favorites || []);
          // Cache profile for quota fallback
          localStorage.setItem(`profile_${user.uid}`, JSON.stringify(data));
        } else {
          // Document doesn't exist, create it
          try {
            await setDoc(userRef, {
              uid: user.uid,
              displayName: user.displayName || 'Anonymous Collector',
              email: user.email || '',
              photoURL: user.photoURL || '',
              role: user.email === 'smubasshir532@gmail.com' ? 'admin' : 'user',
              favorites: [],
              bio: '',
              preferredCategories: [],
              externalCollectionUrl: '',
              location: '',
              createdAt: serverTimestamp()
            });
          } catch (error) {
            if (!(error as any).message?.includes('Quota limit exceeded')) {
              setAppError(handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`));
            }
          }
        }
      }, (error) => {
        if (error.message?.includes('Quota limit exceeded')) {
          console.warn('Quota limit exceeded for user profile. Using fallback.');
          // Attempt fallback from localStorage
          const cached = localStorage.getItem(`profile_${user.uid}`);
          if (cached) {
            try {
              const data = JSON.parse(cached);
              setUserProfile(data);
              setFavorites(data.favorites || []);
            } catch (e) {
              console.error("Failed to parse cached profile", e);
              localStorage.removeItem(`profile_${user.uid}`);
            }
          } else {
            // Minimal fallback from Auth
            setUserProfile({
              uid: user.uid,
              displayName: user.displayName || 'Anonymous Collector',
              email: user.email || '',
              photoURL: user.photoURL || '',
              role: user.email === 'smubasshir532@gmail.com' ? 'admin' : 'user',
              favorites: [],
              bio: 'Limited mode active due to high traffic.',
              preferredCategories: [],
              externalCollectionUrl: '',
              location: ''
            } as UserProfile);
          }
        } else {
          setAppError(handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Use a limit and orderBy to save quota and ensure newest items are first
      let q = query(collection(db, 'items'), orderBy('createdAt', 'desc'), limit(100));
      let snapshot;
      
      try {
        snapshot = await getDocs(q);
      } catch (orderError) {
        console.warn('OrderBy failed, falling back to unordered query:', orderError);
        q = query(collection(db, 'items'), limit(100));
        snapshot = await getDocs(q);
      }
      
      console.log('Items snapshot received:', snapshot.size, 'docs');
      const i = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuctionItem));
      // Sort manually to avoid index requirements and handle missing fields
      i.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
      setItems(i);
      setLoading(false);
      // Cache items for fallback
      localStorage.setItem('cached_items', JSON.stringify(i));
    } catch (error: any) {
      console.error('Items fetch error:', error);
      if (error.message?.includes('Quota limit exceeded')) {
        console.warn('Quota limit exceeded for items. Using cached data.');
        const cached = localStorage.getItem('cached_items');
        if (cached) {
          try {
            setItems(JSON.parse(cached));
          } catch (e) {
            console.error("Failed to parse cached items", e);
            localStorage.removeItem('cached_items');
            setItems(SAMPLE_ITEMS);
          }
        } else {
          // Last resort: Sample Data
          setItems(SAMPLE_ITEMS);
          console.log('Using sample items due to empty cache and quota limit.');
        }
      } else {
        setAppError(handleFirestoreError(error, OperationType.GET, 'items'));
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // Refresh items every 10 minutes to keep data relatively fresh without eating quota
    const interval = setInterval(fetchItems, 600000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedItem) {
      // Limit reviews to save quota
      const q = query(collection(db, 'items', selectedItem.id, 'reviews'), orderBy('timestamp', 'desc'), limit(10));
      const reviewsUnsubscribe = onSnapshot(q, (snapshot) => {
        const r = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
        setReviews(r);
      }, (error) => {
        if (error.message?.includes('Quota limit exceeded')) {
          console.warn('Quota limit exceeded for reviews.');
        } else {
          setAppError(handleFirestoreError(error, OperationType.GET, `items/${selectedItem.id}/reviews`));
        }
      });
      return () => reviewsUnsubscribe();
    } else {
      setReviews([]);
    }
  }, [selectedItem]);

  const toggleFavorite = async (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) {
      setAppError(new Error("Authentication required to save favorites."));
      return;
    }
    
    const newFavorites = favorites.includes(itemId)
      ? favorites.filter(id => id !== itemId)
      : [...favorites, itemId];
    
    setFavorites(newFavorites);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        favorites: newFavorites
      });
    } catch (error) {
      setAppError(handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`));
    }
  };

  const handleReviewSubmit = async (reviewData: Omit<Review, 'id' | 'timestamp'>) => {
    if (!user || !showReviewModal) return;

    try {
      const reviewRef = collection(db, 'items', showReviewModal.id, 'reviews');
      await addDoc(reviewRef, {
        ...reviewData,
        reviewerUid: user.uid,
        reviewerName: user.displayName || 'Anonymous Collector',
        timestamp: serverTimestamp()
      });
      setShowReviewModal(null);
    } catch (error) {
      setAppError(handleFirestoreError(error, OperationType.CREATE, `items/${showReviewModal.id}/reviews`));
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           item.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterType === 'all' || 
                             (filterType === 'Trending' ? item.bidCount > 0 : (item.category === filterType || item.listingType === filterType));
      
      // If filter is 'all', show everything (active, sold, ended)
      // If a specific category is selected, only show active items in that category
      if (filterType === 'all') return matchesSearch;
      return matchesSearch && matchesCategory && item.status === 'active';
    });
  }, [items, searchQuery, filterType]);

  const favoriteItems = useMemo(() => {
    return items.filter(item => favorites.includes(item.id));
  }, [items, favorites]);

  const userConsignments = useMemo(() => {
    return items.filter(item => item.sellerUid === user?.uid);
  }, [items, user]);

  const acquisitions = useMemo(() => {
    return items.filter(item => item.buyerUid === user?.uid);
  }, [items, user]);

  const handleConsign = async (data: any) => {
    if (!user) {
      setAppError(new Error("Authentication required to list an item."));
      return;
    }
    
    try {
      if (editingItem) {
        const updatedItem: any = {
          title: data.title,
          description: data.description,
          listingType: data.listingType,
          category: data.category,
          images: data.images && data.images.length > 0 ? data.images : ['https://picsum.photos/seed/artifact/800/600']
        };

        if (data.listingType === 'buy-now') {
          updatedItem.price = parseFloat(data.price) || 0;
          updatedItem.currentBid = null;
          updatedItem.endTime = null;
        } else {
          updatedItem.currentBid = parseFloat(data.startingBid) || 0;
          updatedItem.price = null;
          if (data.endTime) {
            updatedItem.endTime = Timestamp.fromDate(new Date(data.endTime));
          } else {
            const durationDays = parseInt(data.duration) || 7;
            updatedItem.endTime = Timestamp.fromDate(new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000));
          }
        }

        await updateDoc(doc(db, 'items', editingItem.id), updatedItem);

        // Optimistically update local state
        setItems(prev => prev.map(item => item.id === editingItem.id ? { ...item, ...updatedItem } : item));
        
        // Manual refresh after update to sync with server
        setTimeout(fetchItems, 1000);

        setEditingItem(null);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
      } else {
        const newItem = {
          title: data.title,
          description: data.description,
          listingType: data.listingType,
          category: data.category,
          price: data.listingType === 'buy-now' ? (parseFloat(data.price) || 0) : null,
          currentBid: data.listingType === 'auction' ? (parseFloat(data.startingBid) || 0) : null,
          bidCount: 0,
          images: data.images && data.images.length > 0 ? data.images : ['https://picsum.photos/seed/artifact/800/600'],
          sellerUid: user.uid,
          sellerName: userProfile?.displayName || user.displayName || 'Anonymous Collector',
          status: 'active',
          createdAt: serverTimestamp(),
          endTime: data.listingType === 'auction'
            ? (data.endTime ? Timestamp.fromDate(new Date(data.endTime)) : Timestamp.fromDate(new Date(Date.now() + (parseInt(data.duration) || 7) * 24 * 60 * 60 * 1000)))
            : null
        };

        const docRef = await addDoc(collection(db, 'items'), newItem);
        
        // Optimistically add to local state for instant visibility
        const itemWithId = { 
          ...newItem, 
          id: docRef.id, 
          createdAt: Timestamp.now() // Local approximation for immediate display
        } as AuctionItem;
        setItems(prev => [itemWithId, ...prev]);
        
        // Manual refresh after creation to sync with server (especially for serverTimestamp)
        setTimeout(fetchItems, 5000);
        
        setShowToast(true);
        setTimeout(() => setShowToast(false), 5000);
      }
      setView('marketplace');
      setFilterType('all');
    } catch (error) {
      setAppError(handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, editingItem ? `items/${editingItem.id}` : 'items'));
    }
  };

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    setNewsletterSuccess(true);
    setTimeout(() => setNewsletterSuccess(false), 5000);
  };

  const handleMembershipSubmit = (data: any) => {
    console.log("Membership Application:", data);
    setShowMembershipModal(false);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 5000);
  };

  const scrollToSection = (id: string) => {
    if (view !== 'home') {
      setView('home');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'items', id));
      // Optimistically remove from local state
      setItems(prev => prev.filter(item => item.id !== id));
      setItemToDelete(null);
      // Sync with server after a delay
      setTimeout(fetchItems, 2000);
    } catch (error) {
      setAppError(handleFirestoreError(error, OperationType.DELETE, `items/${id}`));
    }
  };

  const handleUpdateFeaturedImage = async (url: string) => {
    if (userProfile?.role !== 'admin') return;
    try {
      await setDoc(doc(db, 'settings', 'featured'), { url });
    } catch (error) {
      setAppError(handleFirestoreError(error, OperationType.WRITE, 'settings/featured'));
    }
  };

  const seedInitialData = async () => {
    if (!user) {
      setAppError(new Error("Authentication required to seed data."));
      return;
    }
    
    const initialItems = [
      {
        title: "18th Century French Rococo Armchair",
        description: "An exquisite example of 18th-century French craftsmanship, this Rococo armchair features hand-carved walnut detailing and original silk damask upholstery.",
        price: 12500,
        listingType: "buy-now",
        category: "Furniture",
        images: ["https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=1000"],
        sellerUid: user.uid,
        sellerName: "Elite Curator",
        status: "active",
        createdAt: serverTimestamp(),
        bidCount: 0
      },
      {
        title: "Patek Philippe Perpetual Calendar 1952",
        description: "A legendary timepiece of unparalleled rarity. Features a perpetual calendar, moon phase indicator, and an 18k yellow gold case.",
        currentBid: 45000,
        listingType: "auction",
        category: "Timepieces",
        images: ["https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=1000"],
        sellerUid: user.uid,
        sellerName: "Elite Curator",
        status: "active",
        createdAt: serverTimestamp(),
        bidCount: 5,
        endTime: Timestamp.fromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
      },
      {
        title: "Imperial Ming Dynasty Celadon Vase",
        description: "A breathtaking Ming Dynasty vase with a rare sea-foam celadon glaze. Features intricate lotus scroll motifs.",
        currentBid: 28000,
        listingType: "auction",
        category: "Fine Art",
        images: ["https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&q=80&w=1000"],
        sellerUid: user.uid,
        sellerName: "Elite Curator",
        status: "active",
        createdAt: serverTimestamp(),
        bidCount: 8,
        endTime: Timestamp.fromDate(new Date(Date.now() + 6 * 24 * 60 * 60 * 1000))
      },
      {
        title: "Victorian Diamond & Emerald Tiara",
        description: "A stunning Victorian era tiara set with over 50 carats of old-cut diamonds and deep green Colombian emeralds.",
        price: 85000,
        listingType: "buy-now",
        category: "Jewelry",
        images: ["https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&q=80&w=1000"],
        sellerUid: user.uid,
        sellerName: "Elite Curator",
        status: "active",
        createdAt: serverTimestamp(),
        bidCount: 0
      },
      {
        title: "Gutenberg Bible Fragment",
        description: "An original vellum fragment from the Gutenberg Bible, the first major book printed using mass-produced movable metal type in Europe.",
        currentBid: 120000,
        listingType: "auction",
        category: "Manuscripts",
        images: ["https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=1000"],
        sellerUid: user.uid,
        sellerName: "Elite Curator",
        status: "active",
        createdAt: serverTimestamp(),
        bidCount: 15,
        endTime: Timestamp.fromDate(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000))
      }
    ];

    try {
      const seededItems: AuctionItem[] = [];
      for (const item of initialItems) {
        const docRef = await addDoc(collection(db, 'items'), item);
        seededItems.push({ ...item, id: docRef.id, createdAt: Timestamp.now() } as AuctionItem);
      }
      
      // Optimistically add to local state
      setItems(prev => [...seededItems, ...prev]);
      
      // Refresh items after seeding with a delay to allow index propagation
      setTimeout(fetchItems, 5000);
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    } catch (error) {
      setAppError(handleFirestoreError(error, OperationType.CREATE, 'items'));
    }
  };

  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), data);
    } catch (error) {
      setAppError(handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`));
      throw error;
    }
  };

  const handleRetryAll = async () => {
    setAppError(null);
    setLoading(true);
    await fetchItems();
  };

  const handleOfflineMode = () => {
    setAppError(null);
    const cached = localStorage.getItem('cached_items');
    if (cached) {
      try {
        setItems(JSON.parse(cached));
      } catch (e) {
        setItems(SAMPLE_ITEMS);
      }
    } else {
      setItems(SAMPLE_ITEMS);
    }
  };

  return (
    <PayPalScriptProvider options={{ clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "test" }}>
      <div className="min-h-screen flex flex-col selection:bg-accent selection:text-white relative overflow-x-hidden">
        {/* Archival Sync Interruption Graceful UI Overlay */}
        {appError && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
            <div className="bg-zinc-900 border border-amber-500/20 max-w-lg w-full p-8 rounded-[2rem] shadow-[0_40px_100px_rgba(0,0,0,0.8)] text-white text-center space-y-6 animate-fadeIn">
              <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <ShieldCheck className="w-8 h-8 text-red-500 animate-pulse" />
              </div>
              <h3 className="text-2xl font-serif font-black uppercase tracking-tight text-white">
                Archival Sync Interrupted
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {(() => {
                  try {
                    const parsedError = JSON.parse(appError.message);
                    if (parsedError.error) {
                      return `We encountered an issue during database communication: ${parsedError.error} (Action: ${parsedError.operationType} on Path: ${parsedError.path})`;
                    }
                  } catch (e) {}
                  return appError.message || "An unexpected connection interruption has occurred.";
                })()}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  onClick={handleRetryAll}
                  className="flex-1 py-3 px-4 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-zinc-200 transition-all shadow-md cursor-pointer"
                >
                  Retry Connection
                </button>
                <button
                  onClick={handleOfflineMode}
                  className="flex-1 py-3 px-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black uppercase tracking-widest text-[10px] rounded-xl hover:bg-amber-500/20 transition-all cursor-pointer"
                >
                  Offline Catalog
                </button>
                <button
                  onClick={() => setAppError(null)}
                  className="py-3 px-4 text-zinc-500 hover:text-zinc-300 text-[10px] uppercase font-black tracking-widest cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

      {/* 3D Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-accent/5 blur-[80px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Navbar 
        user={user} 
        userProfile={userProfile}
        isAdmin={isAdmin}
        onSignIn={signInWithGoogle} 
        onSignOut={logout} 
        setView={setView}
        favoritesCount={favorites.length}
        view={view}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchHistory={searchHistory}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        onAboutClick={() => scrollToSection('about')}
        onMembershipClick={() => scrollToSection('membership')}
        featuredImageUrl={featuredImageUrl}
      />

      <main className="flex-grow bg-paper">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-0"
            >
              <Hero 
                onExplore={() => setView('marketplace')} 
                onConsign={() => setView('sell')} 
                featuredImageUrl={featuredImageUrl}
                loading={loading}
                isAdmin={isAdmin}
              />

              {/* Curatorial Departments Section */}
              <section className="py-20 md:py-28 px-4 md:px-12 max-w-[1700px] mx-auto border-b border-stone-200">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 pb-6 border-b border-stone-200 gap-4">
                  <div className="space-y-2">
                    <span className="text-amber-900 text-xs font-sans font-semibold tracking-[0.25em] uppercase">
                      Curatorial Departments · 5 Disciplines
                    </span>
                    <h3 className="text-3xl md:text-4xl font-serif font-normal text-stone-900 tracking-tight">
                      Archival Curations by Department
                    </h3>
                  </div>
                  <button 
                    onClick={() => {
                      setFilterType('all');
                      setView('marketplace');
                    }}
                    className="text-xs font-sans uppercase tracking-[0.2em] text-stone-600 hover:text-stone-950 font-medium flex items-center gap-1.5 transition-colors self-start md:self-auto"
                  >
                    <span>View Full Catalogue</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
                  {[
                    { id: 'Fine Art', num: '01', desc: 'Old Masters, Impressionist & Contemporary' },
                    { id: 'Timepieces', num: '02', desc: 'Complications & Haute Horlogerie' },
                    { id: 'Furniture', num: '03', desc: 'Antiquities, Sculptures & Decorative Arts' },
                    { id: 'Jewelry', num: '04', desc: 'Period Gemstones & Signed Creations' },
                    { id: 'Manuscripts', num: '05', desc: 'Illuminated Texts & Historical Treatises' }
                  ].map((dept, index) => (
                    <motion.div
                      key={dept.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      onClick={() => {
                        setFilterType(dept.id);
                        setView('marketplace');
                      }}
                      className="bg-white border border-stone-200/90 p-5 md:p-6 cursor-pointer group hover:border-stone-800 hover:bg-[#faf7f2] transition-all duration-300 flex flex-col justify-between min-h-[160px] md:min-h-[190px]"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-serif italic text-stone-400 group-hover:text-amber-900 transition-colors">
                          {dept.num}.
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-stone-900 group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="text-base md:text-lg font-serif font-medium text-stone-900 group-hover:text-amber-950 transition-colors leading-snug">
                          {dept.id}
                        </h4>
                        <p className="text-[10px] font-sans text-stone-500 leading-relaxed font-normal">
                          {dept.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
              
              {/* Three Curatorial Pillars */}
              <section className="py-20 md:py-28 px-6 md:px-12 max-w-[1700px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-16 border-b border-stone-200">
                {[
                  {
                    num: "I",
                    title: "Historical Provenance",
                    desc: "Every artifact cataloged by Strawboss undergoes forensic material analysis, scientific dating, and exhaustive archival chain-of-custody verification."
                  },
                  {
                    num: "II",
                    title: "Private Treaty & Discretion",
                    desc: "Beyond public auctions, we broker confidential acquisitions between high-net-worth family offices, state institutions, and private collectors worldwide."
                  },
                  {
                    num: "III",
                    title: "White-Glove Custody",
                    desc: "Climate-stabilized transit, museum-grade art packing, and insured dual-custody hand-delivery overseen by certified registrars across 54 countries."
                  }
                ].map((feature, index) => (
                  <motion.div 
                    key={feature.title}
                    initial={{ opacity: 0, y: 25 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="space-y-4 group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-serif italic text-amber-900 font-semibold">{feature.num}.</span>
                      <span className="h-[1px] w-8 bg-stone-300 group-hover:bg-amber-900 transition-colors" />
                    </div>
                    <h4 className="text-xl font-serif font-medium text-stone-900 tracking-tight leading-snug">{feature.title}</h4>
                    <p className="text-stone-600 text-sm leading-relaxed font-serif italic">{feature.desc}</p>
                  </motion.div>
                ))}
              </section>

              {/* Institutional Performance Ledger (Replaced generic Blue Bar) */}
              <section className="bg-[#161412] text-[#fbf9f5] py-20 px-6 md:px-12 border-b border-stone-800">
                <div className="max-w-[1700px] mx-auto">
                  <div className="text-center mb-12">
                    <span className="text-amber-400 text-xs font-sans uppercase tracking-[0.25em] font-semibold">
                      Institutional Record & Global Standards
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 text-center divide-y lg:divide-y-0 lg:divide-x divide-stone-800">
                    {[
                      { label: "Authenticated Valuations", value: "$4.2B+" },
                      { label: "Verified Private Estates", value: "340+" },
                      { label: "Provenance Certification", value: "100%" },
                      { label: "Courier Sovereign Reach", value: "54 Nations" }
                    ].map((stat, index) => (
                      <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 15 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className={cn("space-y-2", index > 0 && "pt-6 lg:pt-0 lg:pl-8")}
                      >
                        <h4 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-normal tracking-tight text-[#fbf9f5] tabular-nums">
                          {stat.value}
                        </h4>
                        <p className="text-xs font-sans uppercase tracking-[0.18em] text-stone-400 font-medium">
                          {stat.label}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Archival Monograph Gazette Dispatch (Replaced generic newsletter) */}
              <section className="py-24 px-6 md:px-12 bg-[#faf8f5] border-b border-stone-200">
                <div className="max-w-2xl mx-auto text-center space-y-6">
                  <div className="space-y-3">
                    <span className="text-amber-900 text-xs font-sans uppercase tracking-[0.25em] font-semibold block">
                      The Strawboss Monograph
                    </span>
                    <h3 className="text-3xl md:text-4xl font-serif font-normal text-stone-900 tracking-tight">
                      Private Treaty Bulletins & Catalogues
                    </h3>
                    <p className="text-stone-600 font-serif italic text-base leading-relaxed">
                      Receive advance auction catalogues, private view invitations, and scholarly provenance monographs directly to your correspondence desk.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-3">
                    <input 
                      type="email" 
                      placeholder="curator@estate-archives.org" 
                      className="flex-grow px-5 py-3.5 bg-white border border-stone-300 rounded-none text-xs font-sans placeholder:text-stone-400 focus:outline-none focus:border-stone-900 transition-colors"
                    />
                    <button className="btn-primary px-8 py-3.5 whitespace-nowrap text-xs font-sans tracking-[0.2em]">
                      Request Dispatch
                    </button>
                  </div>
                </div>
              </section>

              {/* Highlights Section Header */}
              <section className="py-24 md:py-32 px-6 md:px-12 max-w-[1700px] mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16 pb-6 border-b border-stone-200">
                  <div className="space-y-2">
                    <span className="text-amber-900 text-xs font-sans uppercase tracking-[0.25em] font-semibold block">
                      Curated Highlights · Spring Exhibition
                    </span>
                    <h3 className="text-3xl md:text-5xl font-serif font-normal text-stone-900 tracking-tight">
                      Selected Masterpieces & Lots
                    </h3>
                  </div>
                  <button 
                    onClick={() => setView('marketplace')}
                    className="text-xs font-sans uppercase tracking-[0.2em] text-stone-700 hover:text-stone-950 font-semibold flex items-center gap-2 group transition-colors"
                  >
                    <span>View All Active Archives</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 perspective-2000">
                  {loading ? (
                    [...Array(3)].map((_, i) => <ItemCardSkeleton key={i} />)
                  ) : (
                    items.slice(0, 3).map((item, index) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <ItemCard 
                          item={item} 
                          onClick={() => {
                            setSelectedItem(item);
                            setView('detail');
                          }} 
                          isFavorite={favorites.includes(item.id)}
                          onToggleFavorite={(e) => toggleFavorite(item.id, e)}
                        />
                      </motion.div>
                    ))
                  )}
                </div>
              </section>

              <ReviewsSection />
              <MembershipSection onApply={() => setShowMembershipModal(true)} />

              {isAdmin && (
                <div className="py-20 text-center space-y-4">
                  <p className="text-xs font-black uppercase tracking-widest text-primary/30">Administrative Controls</p>
                  <p className="text-[10px] text-zinc-400">Items Count: {items.length} | Loading: {loading ? 'YES' : 'NO'}</p>
                  <div className="flex justify-center gap-4">
                    <button onClick={() => setView('admin')} className="btn-primary">Open Admin Panel</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'marketplace' && (
            <motion.div 
              key="marketplace"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Archives 
                items={items}
                onRefresh={fetchItems}
                user={user}
                loading={loading}
                printSelectedIds={printSelectedIds}
                setPrintSelectedIds={setPrintSelectedIds}
                onItemClick={(item: AuctionItem) => {
                  setSelectedItem(item);
                  setView('detail');
                }}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filterType={filterType}
                setFilterType={setFilterType}
                favorites={favorites}
                onToggleFavorite={(id: string, e: React.MouseEvent) => {
                  toggleFavorite(id, e);
                }}
                sortBy={sortBy}
                setSortBy={setSortBy}
              />
              <MembershipSection onApply={() => setShowMembershipModal(true)} />
            </motion.div>
          )}

          {view === 'about' && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AboutSection />
            </motion.div>
          )}
          {view === 'membership' && (
            <motion.div
              key="membership"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <MembershipSection onApply={() => setShowMembershipModal(true)} />
            </motion.div>
          )}

          {view === 'dashboard' && userProfile && (
            <motion.div
              key="user-dashboard"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <UserDashboard 
                userProfile={userProfile}
                favorites={favoriteItems}
                consignments={userConsignments}
                loading={loading}
                onItemClick={(item) => {
                  setSelectedItem(item);
                  setView('detail');
                }}
                onToggleFavorite={(id, e) => {
                  e.stopPropagation();
                  toggleFavorite(id);
                }}
                items={items}
                onLeaveReview={(item) => {
                  setShowReviewModal(item);
                }}
                onEditItem={(item) => {
                  setEditingItem(item);
                  setView('sell');
                }}
                onUpdateProfile={handleUpdateProfile}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
              />
            </motion.div>
          )}

          {view === 'admin' && user?.email === 'smubasshir532@gmail.com' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminPanel 
                items={items} 
                onDelete={(id) => setItemToDelete(id)} 
                featuredImageUrl={featuredImageUrl}
                onUpdateFeaturedImage={handleUpdateFeaturedImage}
                loading={loading}
                onRefresh={fetchItems}
                onAdd={() => {
                  setEditingItem(null);
                  setShowConsignModal(true);
                }}
                onEdit={(item) => {
                  setEditingItem(item);
                  setShowConsignModal(true);
                }}
              />
            </motion.div>
          )}

          {view === 'sell' && (
            <ConsignmentForm 
              onCancel={() => {
                setEditingItem(null);
                setView('marketplace');
              }} 
              onSubmit={handleConsign}
              onError={(err) => setAppError(err)}
              initialData={editingItem ? {
                title: editingItem.title,
                description: editingItem.description,
                listingType: editingItem.listingType,
                category: editingItem.category,
                price: editingItem.price?.toString() || '',
                startingBid: editingItem.currentBid?.toString() || '',
                duration: '7',
                endTime: editingItem.endTime 
                  ? (() => {
                      const d = typeof editingItem.endTime.toDate === 'function' 
                        ? editingItem.endTime.toDate() 
                        : new Date(editingItem.endTime.seconds * 1000);
                      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    })()
                  : '',
                images: editingItem.images
              } : undefined}
            />
          )}

          {view === 'detail' && selectedItem && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ItemDetail 
                item={selectedItem} 
                user={user} 
                userProfile={userProfile}
                loading={loading}
                onBack={() => setView('marketplace')} 
                reviews={reviews}
                allItems={items}
                onItemClick={(item) => {
                  setSelectedItem(item);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                onShowToast={() => {
                  setShowToast(true);
                  setTimeout(() => setShowToast(false), 5000);
                }}
                onError={(err) => setAppError(err)}
                onRefresh={fetchItems}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showConsignModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-primary/60 backdrop-blur-2xl p-4 md:p-6 overflow-y-auto">
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="bg-surface w-full max-w-4xl rounded-[2.5rem] md:rounded-[4rem] shadow-[0_80px_160px_rgba(0,31,63,0.4)] border border-white/20 p-8 md:p-16 space-y-8 md:space-y-12 relative my-8"
            >
              <button 
                onClick={() => setShowConsignModal(false)}
                className="absolute top-6 right-6 md:top-12 md:right-12 text-primary/20 hover:text-primary transition-colors"
              >
                <X className="w-6 h-6 md:w-8 md:h-8" />
              </button>
              <ConsignmentForm 
                onCancel={() => {
                  setEditingItem(null);
                  setShowConsignModal(false);
                }} 
                onSubmit={async (data) => {
                  await handleConsign(data);
                  setShowConsignModal(false);
                }}
                onError={(err) => setAppError(err)}
                initialData={editingItem ? {
                  title: editingItem.title,
                  description: editingItem.description,
                  listingType: editingItem.listingType,
                  category: editingItem.category,
                  price: editingItem.price?.toString() || '',
                  startingBid: editingItem.currentBid?.toString() || '',
                  duration: '7',
                  endTime: editingItem.endTime 
                    ? (() => {
                        const d = typeof editingItem.endTime.toDate === 'function' 
                          ? editingItem.endTime.toDate() 
                          : new Date(editingItem.endTime.seconds * 1000);
                        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      })()
                    : '',
                  images: editingItem.images
                } : undefined}
              />
            </motion.div>
          </div>
        )}

        {itemToDelete && (
          <ConfirmationModal 
            title="Archive Artifact"
            message="Are you sure you want to archive this piece from the collection? This action is irreversible."
            onCancel={() => setItemToDelete(null)}
            onConfirm={() => {
              handleDeleteItem(itemToDelete);
              setItemToDelete(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Live Chat Floating Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1, rotate: 5 }}
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-8 right-8 z-50 w-16 h-16 bg-primary text-white rounded-full shadow-[0_20px_40px_rgba(0,0,255,0.3)] flex items-center justify-center group overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <MessageSquare className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent rounded-full border-2 border-white animate-pulse" />
      </motion.button>

      <Footer 
        onNewsletterSubmit={handleNewsletter} 
        showSuccess={newsletterSuccess} 
        featuredImageUrl={featuredImageUrl} 
        user={user}
        setView={setView}
        isAdmin={isAdmin}
      />

      <AnimatePresence>
        {showMembershipModal && (
          <MembershipModal 
            onCancel={() => setShowMembershipModal(false)}
            onSubmit={handleMembershipSubmit}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReviewModal && user && (
          <ReviewModal 
            item={showReviewModal} 
            onCancel={() => setShowReviewModal(null)} 
            onSubmit={handleReviewSubmit} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showChat && (
          <ChatWindow 
            onClose={() => setShowChat(false)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-24 md:bottom-12 left-1/2 z-[200] bg-primary text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-4 border border-white/10"
          >
            <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">Topup Product Added Successfully</span>
          </motion.div>
        )}
      </AnimatePresence>

      {view !== 'detail' && (
        <MobileBottomNav 
          view={view} 
          setView={setView} 
          favoritesCount={favorites.length}
          user={user}
          isAdmin={isAdmin}
        />
      )}

      {/* Back to Top Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.1 }}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-24 right-8 z-[90] w-12 h-12 bg-white/80 backdrop-blur-xl border border-black/5 rounded-full shadow-xl flex items-center justify-center text-primary lg:hidden"
      >
        <ArrowLeft className="w-5 h-5 rotate-90" />
      </motion.button>
    </div>
    </PayPalScriptProvider>
  );
}
