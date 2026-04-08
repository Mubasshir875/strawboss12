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
  getDocFromServer
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Plus, 
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
  Menu,
  ArrowUpRight,
  Heart,
  Tag,
  Image as ImageIcon,
  Send,
  Loader2,
  Truck,
  Info,
  Sparkles
} from 'lucide-react';
import { generateItemDescription } from './lib/gemini';
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
  shippingStatus?: 'pending' | 'shipped' | 'delivered';
  endingSoonEmailSent?: boolean;
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
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error?.message || "");
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} (${parsedError.operationType} on ${parsedError.path})`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4 text-center">
          <div className="max-w-md">
            <h2 className="text-2xl font-display mb-4">A Classical Interruption</h2>
            <p className="text-gray-400 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-white text-black font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              Reload Gallery
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-primary/5 rounded-2xl", className)} />
);

const ItemCardSkeleton = () => (
  <div className="bg-surface border border-primary/5 overflow-hidden rounded-[2rem] shadow-sm">
    <div className="aspect-[3/4] bg-primary/5 animate-pulse" />
    <div className="p-6 space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-full" />
      </div>
      <div className="pt-4 border-t border-primary/5 flex justify-between items-end">
        <div className="space-y-2">
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-10 w-20 rounded-none" />
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
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
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
    interest: 'Streetwear',
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
        initial={{ scale: 0.9, y: 50, rotateX: 20 }}
        animate={{ scale: 1, y: 0, rotateX: 0 }}
        exit={{ scale: 0.9, y: 50, rotateX: 20 }}
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

const Navbar = ({ 
  user, 
  userProfile,
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
      className="fixed top-0 left-0 right-0 z-[100] bg-white border-b border-black/5"
    >
      {/* Top Announcement Bar */}
      <div className="bg-black text-white py-2 px-6 text-[10px] md:text-xs font-black uppercase tracking-[0.3em] flex justify-between items-center">
        <span>Est. 1924 | Premier Auction House</span>
        <span className="hidden md:block">Worldwide White-Glove Delivery</span>
        <span className="md:hidden">White-Glove Delivery</span>
      </div>

      <nav className="max-w-[1800px] mx-auto px-6 md:px-12 h-16 md:h-20 flex items-center justify-between">
        {/* Live Bidding Ticker */}
        <div className="absolute top-full left-0 right-0 bg-accent text-white py-1 overflow-hidden z-[-1]">
          <div className="animate-marquee whitespace-nowrap flex items-center gap-12 text-[10px] font-black uppercase tracking-[0.2em]">
            {[
              "Live: 18th Century French Rococo Armchair - Current Bid: $12,500",
              "Upcoming: Imperial Ming Dynasty Vase - Starts in 2h 15m",
              "Sold: 1952 Patek Philippe Perpetual Calendar - Final Price: $245,000",
              "Live: Rare Blue Diamond Pendant - Current Bid: $85,000",
              "Upcoming: Original Manuscript by Leonardo da Vinci - Starts in 5h 30m"
            ].map((text, i) => (
              <span key={i} className="flex items-center gap-4">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {text}
              </span>
            ))}
            {/* Duplicate for seamless loop */}
            {[
              "Live: 18th Century French Rococo Armchair - Current Bid: $12,500",
              "Upcoming: Imperial Ming Dynasty Vase - Starts in 2h 15m",
              "Sold: 1952 Patek Philippe Perpetual Calendar - Final Price: $245,000",
              "Live: Rare Blue Diamond Pendant - Current Bid: $85,000",
              "Upcoming: Original Manuscript by Leonardo da Vinci - Starts in 5h 30m"
            ].map((text, i) => (
              <span key={i + 10} className="flex items-center gap-4">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {text}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-12">
          <div 
            className="flex items-center gap-4 cursor-pointer group"
            onClick={() => setView('home')}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-[#e11d48] rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
                <span className="text-white font-black text-xl md:text-2xl">K</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl md:text-2xl font-black tracking-tighter uppercase leading-none text-black">Strawboss</h1>
                <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-zinc-400 font-bold">Elite Auctions</p>
              </div>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            {[
              { name: 'Antiques', view: 'marketplace' },
              { name: 'Collection', view: 'marketplace' },
              { name: 'Live Auctions', view: 'marketplace' },
              { name: 'Consign', view: 'sell' },
              { name: 'Catalogues', view: 'marketplace' },
              { name: 'New Acquisitions', view: 'marketplace' }
            ].map((item) => (
              <button 
                key={item.name}
                onClick={() => setView(item.view)}
                className={cn(
                  "hover:text-black transition-all duration-300 relative group py-2 whitespace-nowrap",
                  view === item.view && "text-black border-b border-black"
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden xl:flex items-center flex-1 max-w-md mx-12">
          <div className="relative w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-black transition-colors" />
            <input 
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search catalog..."
              className="w-full bg-zinc-50 border border-black/5 rounded-full py-2 pl-12 pr-4 text-xs font-bold tracking-widest outline-none focus:bg-white focus:border-black/20 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 md:gap-8">
          <button 
            onClick={() => setView('dashboard')}
            className="p-2 text-zinc-400 hover:text-black transition-all duration-300 relative group"
          >
            <Heart className={cn("w-5 h-5", favoritesCount > 0 && "fill-black text-black")} />
          </button>

          {user ? (
            <div className="flex items-center gap-4 md:gap-6">
              <button 
                onClick={() => setView('dashboard')}
                className="flex items-center gap-3 group"
              >
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden border border-black/5">
                  <img 
                    src={userProfile?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.uid} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="hidden md:block text-xs font-bold text-zinc-500 group-hover:text-black transition-colors uppercase tracking-widest">
                  {userProfile?.displayName?.split(' ')[0] || 'User'}
                </span>
              </button>
              <button 
                onClick={onSignOut}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-black transition-all duration-300 border border-black/10 px-4 py-2"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={onSignIn}
              className="btn-primary !py-3 !px-6 !text-xs"
            >
              Access
            </button>
          )}

          <button 
            className="lg:hidden p-2 text-black hover:text-zinc-600 transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="lg:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-2xl p-8 space-y-6 z-50"
          >
            <div className="pt-4 pb-2">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input 
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Search catalog..."
                  className="w-full bg-zinc-50 border border-black/5 rounded-full py-3 pl-12 pr-4 text-xs font-bold tracking-widest outline-none focus:bg-white focus:border-black/20 transition-all"
                />
              </div>
            </div>
            {[
              { name: 'Antiques', view: 'marketplace' },
              { name: 'Collection', view: 'marketplace' },
              { name: 'Live Auctions', view: 'marketplace' },
              { name: 'Consign', view: 'sell' },
              { name: 'Catalogues', view: 'marketplace' },
              { name: 'New Acquisitions', view: 'marketplace' },
              ...(user ? [{ name: 'My Profile', view: 'dashboard' }] : [])
            ].map((item) => (
              <button 
                key={item.name}
                onClick={() => {
                  setView(item.view);
                  setIsMobileMenuOpen(false);
                }}
                className="block w-full text-left text-sm font-black uppercase tracking-widest text-gray-500 hover:text-primary transition-all duration-300"
              >
                {item.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

const Hero = ({ onExplore, onConsign, featuredImageUrl, loading }: { onExplore: () => void, onConsign: () => void, featuredImageUrl: string, loading?: boolean }) => {
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
    <section className="relative min-h-screen bg-paper overflow-hidden flex items-center">
      {/* Background Image with Skeleton */}
      <div className="absolute inset-0 z-0">
        {loading ? (
          <Skeleton className="w-full h-full rounded-none opacity-10" />
        ) : (
          <LazyImage 
            src={featuredImageUrl} 
            alt="Hero Background" 
            className="w-full h-full object-cover opacity-[0.08] scale-110 blur-[1px]"
          />
        )}
      </div>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, var(--color-primary) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      
      <div className="max-w-[1800px] mx-auto px-6 md:px-12 w-full grid lg:grid-cols-2 gap-20 items-center pt-32 md:pt-40 pb-24 md:pb-32 relative z-10">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-left space-y-12"
        >
          <div className="space-y-6 max-w-full">
            <div className="flex items-center gap-4">
              <span className="w-12 h-[1px] bg-accent" />
              <span className="text-accent text-xs md:text-base font-black tracking-[0.6em] uppercase">Private Treaty & Consignment Services</span>
            </div>
            <h2 className="text-3xl md:text-7xl font-serif font-black text-ink leading-none tracking-tighter uppercase break-words">
              STRAWBOSS <br />
              <span className="italic font-extralight text-ink/40 lowercase">premier</span> AUCTION
            </h2>
            <p className="text-lg md:text-2xl font-serif italic text-ink/80 max-w-xl leading-relaxed">
              Established 1924. The global standard for authenticated elite auctions and private treaties. Acquire the world's most significant artifacts through our secure, high-stakes digital platform.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 md:gap-10">
            <motion.button 
              whileHover={{ scale: 1.05, y: -5 }}
              whileTap={{ scale: 0.95 }}
              onClick={onExplore}
              className="w-full sm:w-auto bg-primary text-white px-12 md:px-16 py-5 md:py-6 text-base font-black tracking-[0.5em] uppercase hover:bg-ink transition-all duration-700 shadow-[0_40px_80px_rgba(0,0,0,0.2)]"
            >
              Enter Gallery
            </motion.button>
            <button 
              onClick={onConsign}
              className="group flex items-center gap-4 text-base font-black uppercase tracking-[0.4em] text-ink/60 hover:text-ink transition-all duration-500"
            >
              Consign Piece
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            </button>
          </div>

          <div className="flex gap-12 md:gap-20 pt-8 border-t border-black/5">
            <div className="space-y-1">
              <span className="text-2xl md:text-4xl font-serif font-black text-ink">98%</span>
              <p className="text-[10px] md:text-xs uppercase tracking-widest font-black text-ink/40">Authentication</p>
            </div>
            <div className="space-y-1">
              <span className="text-2xl md:text-4xl font-serif font-black text-ink">12k+</span>
              <p className="text-[10px] md:text-xs uppercase tracking-widest font-black text-ink/40">Elite Members</p>
            </div>
            <div className="space-y-1">
              <span className="text-2xl md:text-4xl font-serif font-black text-ink">$4.2B</span>
              <p className="text-[10px] md:text-xs uppercase tracking-widest font-black text-ink/40">Total Sales</p>
            </div>
          </div>
        </motion.div>

        {/* 3D Rotating Featured Lot */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, rotateY: 45 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
          className="hidden lg:block perspective-[2000px]"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <motion.div
            animate={{ 
              rotateX: rotate.x, 
              rotateY: rotate.y,
            }}
            transition={{ type: 'spring', stiffness: 100, damping: 30 }}
            className="relative aspect-[4/5] w-full max-w-md mx-auto bg-surface rounded-[3rem] shadow-[0_100px_200px_rgba(0,0,0,0.4)] overflow-hidden group border border-white/20"
          >
            <div className="absolute inset-0 z-0">
              <LazyImage 
                src={featuredImageUrl} 
                alt="Featured Lot" 
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3s]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            </div>

            <div className="absolute top-10 left-10 z-10">
              <div className="bg-accent text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                Featured Lot #402
              </div>
            </div>

            <div className="absolute bottom-12 left-12 right-12 z-10 space-y-4">
              <h3 className="text-3xl font-serif font-black text-white leading-none uppercase tracking-tighter">
                Imperial Ming <br /> Dynasty Vase
              </h3>
              <div className="flex items-end justify-between">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white/60">Current Valuation</span>
                  <p className="text-4xl font-serif font-black text-white">$850,000</p>
                </div>
                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center">
                  <Gavel className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            {/* Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1.5s] ease-in-out" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

const CountdownTimer = ({ endTime }: { endTime?: Timestamp }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null);

  useEffect(() => {
    if (!endTime) return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = endTime.toDate().getTime() - now;
      if (distance < 0) {
        clearInterval(interval);
        setTimeLeft(null);
        return;
      }
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);

  if (!timeLeft) return <span className="text-accent font-black">AUCTION ENDED</span>;

  return (
    <div className="flex gap-4">
      {[
        { label: 'Days', value: timeLeft.days },
        { label: 'Hrs', value: timeLeft.hours },
        { label: 'Min', value: timeLeft.minutes },
        { label: 'Sec', value: timeLeft.seconds }
      ].map((unit) => (
        <div key={unit.label} className="flex flex-col items-center">
          <span className="text-2xl font-serif font-black text-primary">{unit.value.toString().padStart(2, '0')}</span>
          <span className="text-[8px] uppercase tracking-widest font-black text-ink/40">{unit.label}</span>
        </div>
      ))}
    </div>
  );
};

const ItemCard = ({ item, onClick, isFavorite, onToggleFavorite, onEdit }: { item: AuctionItem, onClick: () => void, isFavorite: boolean, onToggleFavorite: (e: React.MouseEvent) => void, onEdit?: (e: React.MouseEvent) => void }) => {
  const [rotate, setRotate] = useState({ x: 0, y: 0 });

  const isEndingSoon = useMemo(() => {
    if (item.listingType !== 'auction' || !item.endTime || item.status !== 'active') return false;
    const now = Date.now();
    const end = item.endTime.toMillis();
    const diff = end - now;
    return diff > 0 && diff < 24 * 60 * 60 * 1000; // Less than 24 hours
  }, [item]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / 25;
    const rotateY = (centerX - x) / 25;
    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ 
        rotateX: rotate.x, 
        rotateY: rotate.y,
        y: rotate.x !== 0 ? -10 : 0
      }}
      transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      className="group bg-surface border border-primary/5 overflow-hidden cursor-pointer shadow-sm hover:shadow-[0_80px_160px_rgba(0,0,0,0.3)] transition-all duration-500 rounded-[2.5rem] perspective-[1000px]"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <LazyImage 
          src={item.images[0] || `https://picsum.photos/seed/antique-${item.id}/800/1000`} 
          alt={item.title}
          imgClassName="img-fit group-hover:scale-110 transition-transform duration-[1.5s] ease-out"
        />
        
        {/* Quick Action Button on Hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 bg-primary/20 backdrop-blur-[4px] z-20">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-paper text-primary px-10 py-5 rounded-2xl text-sm font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(0,0,0,0.3)] hover:bg-accent hover:text-white transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {item.listingType === 'auction' ? 'Place Valuation' : 'Acquire Now'}
          </motion.button>
        </div>
        
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-30">
          <div className="flex flex-col gap-2">
            <div className="bg-paper/90 backdrop-blur-xl border border-primary/5 px-4 py-2 rounded-full shadow-lg w-fit">
              <span className="text-[10px] font-black text-ink uppercase tracking-widest">
                {item.listingType === 'auction' ? 'Live Auction' : 'Private Treaty'}
              </span>
            </div>
            {isEndingSoon && (
              <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="bg-accent text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 w-fit"
              >
                <Clock className="w-3 h-3 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest">Ending Soon</span>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <button 
              onClick={onToggleFavorite}
              className={cn(
                "w-10 h-10 rounded-full backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all duration-500 hover:scale-110",
                isFavorite ? "bg-accent text-white border-accent" : "bg-black/40 text-white hover:bg-white hover:text-primary"
              )}
            >
              <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
            </button>
            {onEdit && (
              <button 
                onClick={onEdit}
                className="w-10 h-10 rounded-full backdrop-blur-xl border border-white/20 bg-black/40 text-white flex items-center justify-center transition-all duration-500 hover:scale-110 hover:bg-white hover:text-primary"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-primary/90 via-primary/40 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-700 z-30">
          <div className="flex items-center gap-3">
            <div className={cn("w-2 h-2 rounded-full", item.listingType === 'auction' ? "bg-accent animate-pulse" : "bg-green-400")} />
            <span className="text-xs uppercase tracking-[0.3em] font-black text-white">
              {item.listingType === 'auction' ? 'Accepting Valuations' : 'Available Immediately'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.4em] font-black text-accent">{item.category}</span>
            <span className="w-4 h-[1px] bg-primary/10" />
          </div>
          <h4 className="text-xl font-serif font-black text-primary leading-tight group-hover:text-accent transition-colors duration-500">{item.title}</h4>
        </div>
        
        <div className="flex items-end justify-between pt-6 border-t border-primary/5">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-[0.4em] font-black text-ink/40 block">
              {item.listingType === 'auction' ? 'Current Valuation' : 'Acquisition Price'}
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-accent">$</span>
              <span className="text-4xl font-serif font-black text-primary tracking-tighter">
                {(item.listingType === 'auction' ? item.currentBid : item.price)?.toLocaleString()}
              </span>
            </div>
          </div>
          
          <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-all duration-500">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
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

const Marketplace = ({ 
  items, 
  onItemClick, 
  searchQuery, 
  setSearchQuery, 
  filterType, 
  setFilterType,
  favorites,
  onToggleFavorite,
  totalItemsCount,
  onSeed,
  user,
  loading
}: { 
  items: AuctionItem[], 
  onItemClick: (item: AuctionItem) => void,
  searchQuery: string,
  setSearchQuery: (s: string) => void,
  filterType: string,
  setFilterType: (f: string) => void,
  favorites: string[],
  onToggleFavorite: (id: string, e: React.MouseEvent) => void,
  totalItemsCount: number,
  onSeed: () => void,
  user: User | null,
  loading?: boolean
}) => {
  const [sortBy, setSortBy] = useState<'newest' | 'price-low' | 'price-high'>('newest');

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sortBy === 'price-low') return (a.price || a.currentBid || 0) - (b.price || b.currentBid || 0);
      if (sortBy === 'price-high') return (b.price || b.currentBid || 0) - (a.price || a.currentBid || 0);
      return b.createdAt.toMillis() - a.createdAt.toMillis();
    });
  }, [items, sortBy]);

  return (
    <section className="min-h-screen py-24 md:py-48 px-4 md:px-12 bg-paper">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-16 md:mb-32">
          <div className="space-y-6 md:space-y-8">
            <div className="flex items-center gap-4">
              <span className="w-12 h-[1px] bg-black" />
              <span className="text-base font-black uppercase tracking-[0.6em] text-black">Global Catalogues</span>
            </div>
            <h2 className="text-3xl font-serif font-black text-black tracking-tighter leading-[0.9] md:leading-[0.8] uppercase">
              The <br/>Marketplace
            </h2>
          </div>
          
          <div className="flex flex-wrap gap-4 md:gap-8 items-center">
            <div className="flex overflow-x-auto pb-2 -mb-2 no-scrollbar lg:flex-wrap gap-2 md:gap-4 w-full lg:w-auto">
              {['all', 'Trending', 'Fine Art', 'Timepieces', 'Furniture', 'Jewelry', 'Manuscripts'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterType(cat)}
                  className={cn(
                    "px-4 md:px-8 py-2 md:py-4 text-xs md:text-base font-black tracking-[0.3em] uppercase transition-all duration-500 border-b-2 whitespace-nowrap",
                    filterType === cat 
                      ? "border-black text-black" 
                      : "border-transparent text-black/30 hover:text-black hover:border-black/20"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative group">
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-b-2 border-primary/10 px-4 py-4 text-base font-black tracking-[0.3em] uppercase appearance-none cursor-pointer pr-12 focus:border-accent outline-none transition-all text-primary"
              >
                <option value="newest">Newest First</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
              <ChevronRight className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rotate-90 text-primary/20 group-hover:text-accent transition-colors" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-16">
          <AnimatePresence mode="popLayout">
            {loading ? (
              [...Array(8)].map((_, i) => <ItemCardSkeleton key={i} />)
            ) : sortedItems.map((item) => (
              <ItemCard 
                key={item.id} 
                item={item} 
                onClick={() => onItemClick(item)} 
                isFavorite={favorites.includes(item.id)}
                onToggleFavorite={(e) => onToggleFavorite(item.id, e)}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* 3D UX Review Section */}
        <div className="mt-32 md:mt-60 space-y-20">
          <div className="text-center space-y-6">
            <span className="text-accent text-base font-black tracking-[0.6em] uppercase">Elite Reviews</span>
            <h3 className="text-4xl md:text-7xl font-serif font-black text-primary leading-none tracking-tighter uppercase">
              The Member <br />
              <span className="italic font-extralight text-ink/40 lowercase">experience</span>
            </h3>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12 perspective-[2000px]">
            {[
              { name: "Alexander V.", role: "Fine Art Collector", text: "The 3D valuation interface is revolutionary. I can inspect every detail of the lot before placing my bid. Truly elite service." },
              { name: "Elena S.", role: "Watch Enthusiast", text: "Strawboss has set a new standard for digital auctions. The real-time feedback and secure acquisition process are unmatched." },
              { name: "Julian M.", role: "Historical Archivist", text: "Provenance is everything. The transparency and authentication rigor at Strawboss give me complete confidence in every acquisition." }
            ].map((review, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, rotateY: -30, y: 50 }}
                whileInView={{ opacity: 1, rotateY: 0, y: 0 }}
                viewport={{ once: true }}
                whileHover={{ rotateY: 10, rotateX: -5, y: -10 }}
                transition={{ duration: 1, delay: i * 0.2, type: 'spring', stiffness: 100 }}
                className="bg-surface p-10 md:p-12 rounded-[3rem] border border-primary/5 shadow-xl hover:shadow-[0_40px_80px_rgba(0,0,0,0.1)] space-y-8 group transition-all duration-500"
              >
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star key={star} className="w-4 h-4 fill-accent text-accent" />
                  ))}
                </div>
                <p className="text-lg md:text-xl font-serif italic text-primary/70 leading-relaxed">
                  "{review.text}"
                </p>
                <div className="pt-8 border-t border-primary/5 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center font-black text-primary">
                    {review.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest text-primary">{review.name}</p>
                    <p className="text-[10px] uppercase tracking-widest text-primary/40">{review.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {!loading && items.length === 0 && (
          <div className="py-60 text-center space-y-12">
            <div className="w-32 h-32 bg-primary/5 flex items-center justify-center mx-auto rounded-full">
              <Search className="w-12 h-12 text-primary/10" />
            </div>
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-4xl font-serif font-black text-primary/20 italic">
                  {totalItemsCount === 0 ? "The archives are currently empty." : "No artifacts found in archives."}
                </h3>
                <p className="text-ink/80 font-serif italic">
                  {totalItemsCount === 0 
                    ? (user?.email === 'smubasshir532@gmail.com' ? "As an elite curator, you may seed the initial collection." : "Please check back later for new acquisitions.")
                    : "Try refining your search or category filters."}
                </p>
              </div>
              
              {totalItemsCount === 0 && user?.email === 'smubasshir532@gmail.com' ? (
                <button 
                  onClick={onSeed}
                  className="bg-primary text-white px-12 py-5 text-base font-black tracking-[0.4em] uppercase hover:bg-accent transition-all duration-700 shadow-2xl"
                >
                  Seed Archives
                </button>
              ) : (searchQuery || filterType !== 'all') && (
                <button 
                  onClick={() => {
                    setSearchQuery('');
                    setFilterType('all');
                  }}
                  className="bg-primary text-white px-12 py-5 text-base font-black tracking-[0.4em] uppercase hover:bg-accent transition-all duration-700 shadow-2xl"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </div>
        )}
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
      alert("Failed to save profile. Please try again.");
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
  const acquisitions = useMemo(() => items.filter(i => i.buyerUid === userProfile.uid), [items, userProfile.uid]);

  useEffect(() => {
    const key = `recentlyViewed_${userProfile.uid}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const ids = JSON.parse(stored) as string[];
      const viewed = ids.map(id => items.find(i => i.id === id)).filter(Boolean) as AuctionItem[];
      setRecentlyViewed(viewed);
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

        {/* My Collection (Bought) */}
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-primary uppercase tracking-widest">My Collection</h3>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{acquisitions.length} Acquired</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {acquisitions.map(item => (
              <div key={item.id} className="space-y-4">
                <ItemCard 
                  item={item} 
                  onClick={() => onItemClick(item)} 
                  isFavorite={favorites.some(f => f.id === item.id)}
                  onToggleFavorite={(e) => onToggleFavorite(item.id, e)}
                />
                <button
                  onClick={() => onLeaveReview(item)}
                  className="w-full py-4 bg-zinc-50 text-black text-xs font-bold uppercase tracking-widest hover:bg-zinc-100 transition-colors"
                >
                  Leave Feedback
                </button>
              </div>
            ))}
            {acquisitions.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100 rounded-[2.5rem]">
                <p className="text-gray-400 font-medium">Your acquired collection is empty.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ConsignmentForm = ({ onCancel, onSubmit, initialData }: { onCancel: () => void, onSubmit: (data: any) => void, initialData?: any }) => {
  const [formData, setFormData] = useState(initialData || {
    title: '',
    description: '',
    listingType: 'buy-now',
    category: 'Fine Art',
    price: '',
    startingBid: '',
    duration: '7',
    image: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateDescription = async () => {
    if (!formData.title.trim()) {
      return setErrors({ ...errors, title: "Please enter a title first to generate a description." });
    }
    setIsGenerating(true);
    try {
      const description = await generateItemDescription(formData.title, formData.category, formData.listingType);
      if (description) {
        setFormData({ ...formData, description });
        if (errors.description) setErrors(prev => {
          const next = { ...prev };
          delete next.description;
          return next;
        });
      }
    } catch (error) {
      alert("Failed to generate description. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

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
    if (!formData.image) newErrors.image = "Item visual documentation is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFormSubmit = () => {
    if (validate()) {
      onSubmit(formData);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, image: reader.result as string });
        if (errors.image) setErrors(prev => {
          const next = { ...prev };
          delete next.image;
          return next;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      className="max-w-[1400px] mx-auto py-12 md:py-20 px-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-12 items-start">
        {/* Left Side: Photography Guide */}
        <div className="bg-zinc-50 p-8 space-y-8">
          <h3 className="text-lg font-bold text-black uppercase tracking-widest">Photography Guide</h3>
          <ul className="space-y-4 text-sm font-medium text-zinc-600">
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
          
          <div className="pt-8 border-t border-blue-100">
            <div className="relative group">
              <input 
                type="file" 
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label 
                htmlFor="image-upload"
                className={cn(
                  "aspect-square bg-white border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 overflow-hidden rounded-2xl",
                  errors.image ? "border-red-300" : "border-gray-200 hover:border-primary hover:bg-blue-50/30"
                )}
              >
                {formData.image ? (
                  <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <ImageIcon className="w-8 h-8" />
                    <span className="text-xs font-bold uppercase tracking-widest">Upload Image</span>
                  </div>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 md:p-12 shadow-sm space-y-10">
          <div className="space-y-2 border-b border-gray-100 pb-6">
            <h2 className="text-2xl font-serif font-black text-primary uppercase tracking-tight">
              {initialData ? 'Refine Artifact Details' : 'Consign New Artifact'}
            </h2>
            <p className="text-sm text-zinc-400 font-medium tracking-widest uppercase">
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
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Provenance & History</label>
                <button 
                  type="button"
                  onClick={handleGenerateDescription}
                  disabled={isGenerating}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary hover:text-accent disabled:opacity-50 transition-colors"
                >
                  {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isGenerating ? 'Curating...' : 'AI Generate'}
                </button>
              </div>
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
  loading
}: { 
  item: AuctionItem, 
  user: User | null, 
  onBack: () => void, 
  reviews: Review[],
  allItems: AuctionItem[],
  onItemClick: (item: AuctionItem) => void,
  favorites: string[],
  onToggleFavorite: (id: string, e: React.MouseEvent) => void,
  loading?: boolean
}) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [isWatching, setIsWatching] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    if (user) {
      const checkWatchlist = async () => {
        const docRef = doc(db, `users/${user.uid}/watchlist`, item.id);
        const docSnap = await getDoc(docRef);
        setIsWatching(docSnap.exists());
      };
      checkWatchlist();
    }
  }, [user, item.id]);

  const toggleWatchlist = async () => {
    if (!user) return alert("Please sign in to watch items.");
    const docRef = doc(db, `users/${user.uid}/watchlist`, item.id);
    try {
      if (isWatching) {
        await deleteDoc(docRef);
        setIsWatching(false);
      } else {
        await setDoc(docRef, { ...item, watchedAt: serverTimestamp() });
        setIsWatching(true);
      }
    } catch (error) {
      console.error("Error toggling watchlist:", error);
    }
  };

  const handleShipItem = async () => {
    if (user?.email !== 'smubasshir532@gmail.com') return;
    try {
      await updateDoc(doc(db, 'items', item.id), {
        shippingStatus: 'shipped'
      });
      
      // Notify buyer
      if (item.buyerUid) {
        const buyerDoc = await getDoc(doc(db, 'users', item.buyerUid));
        if (buyerDoc.exists()) {
          const buyer = buyerDoc.data();
          if (buyer.email) {
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: buyer.email,
                subject: `Item Shipped: ${item.title}`,
                html: `<p>Great news! Your artifact <strong>${item.title}</strong> has been shipped.</p>
                       <p>Our elite logistics team is ensuring its safe arrival.</p>
                       <a href="${window.location.origin}">Track Acquisition</a>`
              })
            });
          }
        }
      }
      alert("Item marked as shipped and buyer notified.");
    } catch (error) {
      console.error("Error shipping item:", error);
    }
  };
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [appError, setAppError] = useState<Error | null>(null);
  const [selectedImage, setSelectedImage] = useState(item.images[0] || `https://picsum.photos/seed/${item.id}/1200/1500`);
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [showHammer, setShowHammer] = useState(false);

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

  if (appError) throw appError;

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
    const q = query(collection(db, `items/${item.id}/bids`), orderBy('amount', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setBids(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bid)));
      setLoadingBids(false);
    }, (error) => {
      setAppError(handleFirestoreError(error, OperationType.GET, `items/${item.id}/bids`));
      setLoadingBids(false);
    });
  }, [item.id]);

  const handlePlaceBid = async () => {
    if (!user) return alert("Please sign in to place a bid.");
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= (item.currentBid || 0)) {
      return alert("Please enter a valid bid higher than the current bid.");
    }

    const previousBidderUid = item.lastBidderUid;

    try {
      await addDoc(collection(db, `items/${item.id}/bids`), {
        itemId: item.id,
        bidderUid: user.uid,
        bidderName: user.displayName,
        amount,
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, 'items', item.id), {
        currentBid: amount,
        bidCount: (item.bidCount || 0) + 1,
        lastBidderUid: user.uid
      });

      setShowHammer(true);
      setTimeout(() => setShowHammer(false), 2000);

      // Notify previous bidder
      if (previousBidderUid && previousBidderUid !== user.uid) {
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
          buyerDetails: details
        });
        setOrderConfirmed(true);
        setIsBuying(false);
      } catch (error) {
        console.error("Error confirming purchase:", error);
        alert("Failed to confirm purchase. Please try again.");
        setIsBuying(false);
      }
    }, 2000);
  };

  const originalPrice = (item.price || item.currentBid || 1000) * 1.25;
  const discountPercent = 20;

  return (
    <div className="min-h-screen bg-paper pb-40">
      <AnimatePresence>
        {showCheckout && user && (
          <CheckoutModal 
            item={item} 
            user={user} 
            onCancel={() => setShowCheckout(false)} 
            onConfirm={handleConfirmPurchase} 
          />
        )}
      </AnimatePresence>

      <div className="max-w-[1800px] mx-auto px-4 md:px-12 pt-16 md:pt-24">
        <button onClick={onBack} className="group flex items-center gap-4 text-base font-black uppercase tracking-[0.4em] text-ink/80 hover:text-primary transition-all mb-6 md:mb-10">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-2 transition-transform" />
          Back to Archives
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-12 md:gap-24 items-start">
          {/* Left Column: Thumbnails and Main Image */}
          <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
            {/* Vertical Thumbnails */}
            <div className="flex md:flex-col gap-4 overflow-x-auto md:overflow-y-auto md:max-h-[800px] scrollbar-hide">
              {item.images.map((img, idx) => (
                <button 
                  key={idx}
                  onClick={() => setSelectedImage(img)}
                  className={cn(
                    "w-20 h-24 md:w-24 md:h-32 flex-shrink-0 rounded-xl overflow-hidden border-2 transition-all",
                    selectedImage === img ? "border-accent shadow-lg" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <img src={img} alt={`${item.title} view ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>

            {/* Main 3D Image Container */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative flex-1 aspect-[3/4] rounded-[2rem] md:rounded-[3rem] overflow-hidden bg-paper shadow-2xl group perspective-[2000px]"
              onMouseMove={handleImageMouseMove}
              onMouseLeave={handleImageMouseLeave}
            >
              <motion.div
                animate={{ 
                  rotateX: rotate.x, 
                  rotateY: rotate.y,
                }}
                transition={{ type: 'spring', stiffness: 100, damping: 30 }}
                className="w-full h-full"
              >
                <img 
                  src={selectedImage} 
                  alt={item.title} 
                  className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-105" 
                  referrerPolicy="no-referrer"
                />
                {/* Shine effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1.5s]" />
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
                    <div className="bg-accent/90 backdrop-blur-xl p-12 rounded-full shadow-[0_0_100px_rgba(225,29,72,0.5)]">
                      <Gavel className="w-24 h-24 text-white" />
                      <motion.p 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-white font-black uppercase tracking-[0.5em] mt-4 text-center"
                      >
                        Valuation Accepted
                      </motion.p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live Status Badge */}
              <div className="absolute top-8 left-8 z-30">
                <div className="bg-accent text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-3 shadow-xl">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  Live Valuation
                </div>
              </div>
              
              {/* Badges and Icons */}
              <button 
                onClick={(e) => onToggleFavorite(item.id, e)}
                className="absolute top-8 right-8 w-14 h-14 bg-paper/80 backdrop-blur-xl rounded-full flex items-center justify-center shadow-xl hover:bg-paper transition-all group/heart"
              >
                <Heart className={cn(
                  "w-6 h-6 transition-colors",
                  favorites.includes(item.id) ? "fill-accent text-accent" : "text-primary group-hover/heart:text-accent"
                )} />
              </button>

              <div className="absolute bottom-8 right-8">
                <button className="w-14 h-14 bg-paper/80 backdrop-blur-xl rounded-full flex items-center justify-center shadow-xl hover:bg-paper transition-all">
                  <Search className="w-6 h-6 text-primary" />
                </button>
              </div>
            </motion.div>
          </div>

          {/* Right Column: Product Details */}
          <div className="space-y-8 md:space-y-12">
            <div className="space-y-4 md:space-y-6">
              <div className="space-y-2">
                <p className="text-accent font-black text-xs md:text-base uppercase tracking-[0.6em]">STRAWBOSS ARCHIVES</p>
                <h1 className="text-2xl md:text-3xl font-serif font-black text-primary tracking-tighter leading-tight uppercase">
                  {item.title}
                </h1>
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

              <div className="space-y-2">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase tracking-[0.4em] font-black text-ink/40 mb-2">Acquisition Price</span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl md:text-4xl font-black text-accent">$</span>
                      <span className="text-4xl md:text-8xl font-serif font-black text-accent tracking-tighter">
                        {(item.listingType === 'auction' ? item.currentBid : item.price)?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col justify-end pb-2">
                    <span className="text-lg md:text-2xl font-serif text-primary/20 line-through">
                      ${originalPrice.toLocaleString()}
                    </span>
                    <span className="bg-accent/10 text-accent px-2 md:px-3 py-1 rounded-full text-xs md:text-base font-black uppercase tracking-widest w-fit">
                      {discountPercent}% OFF
                    </span>
                  </div>
                </div>
                <p className="text-[10px] md:text-base font-black text-primary/30 uppercase tracking-[0.4em]">Limited-Time Acquisition Opportunity</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-8 pt-4">
              {item.listingType === 'auction' && (
                <div className="bg-primary/5 p-8 rounded-3xl border border-primary/10 space-y-6">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-ink/60">Auction Ends In</span>
                    <CountdownTimer endTime={item.endTime} />
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-primary/10">
                    <span className="text-xs font-black uppercase tracking-widest text-ink/60">Current Bidder</span>
                    <span className="text-sm font-serif italic text-primary">{item.lastBidderUid ? 'Elite Member #'+item.lastBidderUid.slice(0,4) : 'No Bids Yet'}</span>
                  </div>
                </div>
              )}

              {item.status === 'active' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {item.listingType === 'buy-now' ? (
                    <>
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowCheckout(true)}
                        className="bg-primary text-white py-6 md:py-8 rounded-2xl text-sm md:text-base font-black tracking-[0.6em] uppercase shadow-2xl hover:bg-accent transition-all duration-700"
                      >
                        Private Treaty Acquisition
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={toggleWatchlist}
                        className={cn(
                          "bg-paper text-primary border-2 py-6 md:py-8 rounded-2xl text-sm md:text-base font-black tracking-[0.6em] uppercase transition-all duration-700",
                          isWatching ? "border-accent text-accent" : "border-primary hover:bg-primary hover:text-white"
                        )}
                      >
                        {isWatching ? 'Watching' : 'Watch Piece'}
                      </motion.button>
                    </>
                  ) : (
                    <div className="col-span-1 sm:col-span-2 space-y-6">
                      <div className="relative group">
                        <span className="absolute left-8 top-1/2 -translate-y-1/2 text-accent font-serif text-2xl opacity-40 group-focus-within:opacity-100 transition-opacity">$</span>
                        <input 
                          type="number" 
                          className="w-full bg-paper border-2 border-transparent py-6 md:py-8 pl-16 pr-8 outline-none focus:border-accent font-serif text-xl md:text-2xl rounded-2xl transition-all"
                          placeholder="Enter Elite Bid"
                          value={bidAmount}
                          onChange={e => setBidAmount(e.target.value)}
                        />
                      </div>
                      <motion.button 
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handlePlaceBid}
                        className="w-full bg-primary text-white py-8 rounded-2xl text-base font-black tracking-[0.6em] uppercase shadow-2xl hover:bg-accent transition-all duration-700"
                      >
                        Place Valuation
                      </motion.button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="w-full bg-primary/5 text-primary/20 py-10 rounded-2xl text-center text-base font-black tracking-[0.6em] uppercase border-2 border-dashed border-primary/10">
                    Piece Acquired
                  </div>
                  {user?.email === 'smubasshir532@gmail.com' && item.status === 'sold' && item.shippingStatus !== 'shipped' && (
                    <motion.button 
                      whileHover={{ scale: 1.02, y: -5 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleShipItem}
                      className="w-full bg-primary text-white py-8 rounded-2xl text-base font-black tracking-[0.6em] uppercase shadow-2xl hover:bg-accent transition-all duration-700"
                    >
                      Mark as Shipped & Notify Buyer
                    </motion.button>
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

                <div className="bg-paper p-8 rounded-3xl border border-primary/5 flex items-center justify-between group hover:border-accent/30 transition-all">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                      <Truck className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-primary uppercase tracking-widest">Secure Global Shipping</h4>
                      <p className="text-[10px] text-ink/80 uppercase tracking-widest mt-1">White-Glove Delivery Service</p>
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
                  <div className="flex gap-4 items-start">
                    <div className="w-1 h-1 rounded-full bg-accent mt-2" />
                    <p className="text-sm text-ink/70 font-serif italic">Insured white-glove delivery worldwide.</p>
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
                        <p className="text-base text-primary/30 uppercase tracking-widest">{format(review.timestamp.toDate(), 'MMMM d, yyyy')}</p>
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

const AdminPanel = ({ 
  items, 
  onDelete,
  featuredImageUrl,
  onUpdateFeaturedImage,
  onAdd,
  onEdit,
  loading
}: { 
  items: AuctionItem[], 
  onDelete: (id: string) => void,
  featuredImageUrl: string,
  onUpdateFeaturedImage: (url: string) => void,
  onAdd: () => void,
  onEdit: (item: AuctionItem) => void,
  loading?: boolean
}) => {
  const [newUrl, setNewUrl] = useState(featuredImageUrl);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-20 px-6 max-w-7xl mx-auto space-y-24"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-2">
          <span className="text-base font-black uppercase tracking-[0.4em] text-accent">STRAWBOSS ARCHIVES</span>
          <h2 className="text-3xl font-serif font-black text-primary uppercase tracking-tighter">Admin Dashboard</h2>
        </div>
        <button 
          onClick={onAdd}
          className="bg-primary text-white px-10 py-5 rounded-2xl text-base font-black tracking-widest uppercase hover:bg-accent transition-all shadow-xl flex items-center gap-4"
        >
          <Plus className="w-4 h-4" />
          Add New Piece
        </button>
      </div>

      <div className="bg-surface border border-primary/10 p-12 rounded-[2rem] space-y-8">
        <div className="flex items-center gap-4">
          <span className="w-8 h-[1px] bg-accent" />
          <span className="text-base font-black uppercase tracking-[0.4em] text-accent">Main Page Background Settings</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-end">
          <div className="space-y-4">
            <label className="text-base uppercase tracking-[0.3em] font-black text-primary/30">Hero Background Image URL</label>
            <input 
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="w-full bg-surface py-4 px-6 rounded-xl outline-none focus:ring-2 focus:ring-accent/20 transition-all font-mono text-base"
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
      
      <div className="bg-surface border border-primary/10 overflow-hidden rounded-[2rem]">
        {/* Mobile View: Card Layout */}
        <div className="md:hidden divide-y divide-primary/10">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="w-16 h-16 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-2 w-24" />
                  </div>
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            ))
          ) : items.map(item => (
            <div key={item.id} className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <LazyImage src={item.images[0]} alt="" className="w-16 h-16 rounded-xl object-cover shadow-md" />
                <div className="flex-1 min-w-0">
                  <span className="font-serif font-black block text-lg text-primary truncate">{item.title}</span>
                  <span className="text-[10px] text-ink/60 uppercase tracking-widest font-mono">ID: {item.id.slice(0, 8)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest font-black text-primary/60 bg-primary/5 px-3 py-1 rounded-full">{item.listingType}</span>
                <span className="font-serif font-black text-primary">${(item.listingType === 'auction' ? item.currentBid : item.price)?.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className={cn(
                  "text-[10px] uppercase tracking-widest font-black px-4 py-1.5 rounded-full",
                  item.status === 'active' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                )}>
                  {item.status}
                </span>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => onEdit(item)}
                    className="text-primary/60 hover:text-primary transition-colors uppercase tracking-widest text-[10px] font-black flex items-center gap-2"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button 
                    onClick={() => onDelete(item.id)}
                    className="text-red-400 hover:text-red-600 transition-colors uppercase tracking-widest text-[10px] font-black flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Archive
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View: Table Layout */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-primary text-white text-sm uppercase tracking-widest font-bold">
                <th className="p-6">Piece</th>
                <th className="p-6">Type</th>
                <th className="p-6">Price/Bid</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/10">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td className="p-6">
                      <div className="flex items-center gap-5">
                        <Skeleton className="w-14 h-14 rounded-xl" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-2 w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="p-6"><Skeleton className="h-4 w-16" /></td>
                    <td className="p-6"><Skeleton className="h-4 w-24" /></td>
                    <td className="p-6"><Skeleton className="h-4 w-20" /></td>
                    <td className="p-6 text-right"><Skeleton className="h-4 w-32 ml-auto" /></td>
                  </tr>
                ))
              ) : items.map(item => (
                <tr key={item.id} className="hover:bg-surface transition-colors group">
                  <td className="p-6">
                    <div className="flex items-center gap-5">
                      <LazyImage src={item.images[0]} alt="" className="w-14 h-14 rounded-xl object-cover shadow-md" />
                      <div>
                        <span className="font-serif font-black block text-base text-primary">{item.title}</span>
                        <span className="text-[10px] text-ink/60 uppercase tracking-widest font-mono">ID: {item.id.slice(0, 8)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <span className="text-[10px] uppercase tracking-widest font-black text-primary/60 bg-primary/5 px-3 py-1 rounded-full">{item.listingType}</span>
                  </td>
                  <td className="p-6 font-serif font-black text-primary text-base">${(item.listingType === 'auction' ? item.currentBid : item.price)?.toLocaleString()}</td>
                  <td className="p-6">
                    <span className={cn(
                      "text-[10px] uppercase tracking-widest font-black px-4 py-1.5 rounded-full",
                      item.status === 'active' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                    )}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-6 text-right">
                    <div className="flex items-center justify-end gap-5">
                      <button 
                        onClick={() => onEdit(item)}
                        className="text-primary/60 hover:text-primary transition-colors uppercase tracking-widest text-[10px] font-black flex items-center gap-2"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button 
                        onClick={() => onDelete(item.id)}
                        className="text-red-400 hover:text-red-600 transition-colors uppercase tracking-widest text-[10px] font-black flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
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

  const shippingFee = 250; // Elite white-glove shipping
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
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-surface w-full max-w-lg rounded-[2rem] md:rounded-[3rem] shadow-[0_80px_160px_rgba(0,0,0,0.5)] overflow-hidden max-h-[90vh] overflow-y-auto p-8 md:p-12 space-y-8 md:space-y-12 border border-primary/5"
      >
        <div className="flex justify-between items-center border-b border-primary/5 pb-6 md:pb-8">
          <h3 className="text-2xl md:text-3xl font-serif font-black text-primary tracking-tighter uppercase">
            {step === 'info' ? 'Acquisition Details' : 'Review Acquisition'}
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
              className="space-y-8 md:space-y-10"
            >
              <div className="flex gap-4 md:gap-6 items-center bg-primary/[0.02] p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-primary/5">
                <img src={item.images[0]} alt={item.title} className="w-16 h-16 md:w-24 md:h-24 object-cover rounded-xl md:rounded-2xl" />
                <div>
                  <h4 className="text-base md:text-lg font-serif font-black text-primary tracking-tight uppercase">{item.title}</h4>
                  <p className="text-accent text-xs md:text-sm font-black tracking-widest uppercase mt-1">${itemPrice.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-5 md:space-y-6">
                <div className="space-y-2">
                  <label className="text-sm md:text-base font-black uppercase tracking-widest text-ink/80 ml-4">Full Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-primary/[0.02] border border-primary/5 rounded-2xl py-4 md:py-5 px-6 md:px-8 outline-none focus:border-accent transition-all text-primary font-serif italic text-sm md:text-base"
                    placeholder="Julian Vane"
                    value={details.fullName}
                    onChange={e => setDetails({...details, fullName: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm md:text-base font-black uppercase tracking-widest text-ink/80 ml-4">Shipping Address</label>
                  <textarea 
                    rows={2}
                    className="w-full bg-primary/[0.02] border border-primary/5 rounded-2xl py-4 md:py-5 px-6 md:px-8 outline-none focus:border-accent transition-all resize-none text-primary font-serif italic text-sm md:text-base"
                    placeholder="123 Heritage Lane, London"
                    value={details.address}
                    onChange={e => setDetails({...details, address: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-sm md:text-base font-black uppercase tracking-widest text-ink/80 ml-4">City</label>
                    <input 
                      type="text" 
                      className="w-full bg-primary/[0.02] border border-primary/5 rounded-2xl py-4 md:py-5 px-6 md:px-8 outline-none focus:border-accent transition-all text-primary font-serif italic text-sm md:text-base"
                      placeholder="London"
                      value={details.city}
                      onChange={e => setDetails({...details, city: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm md:text-base font-black uppercase tracking-widest text-ink/80 ml-4">Phone</label>
                    <input 
                      type="text" 
                      className="w-full bg-primary/[0.02] border border-primary/5 rounded-2xl py-4 md:py-5 px-6 md:px-8 outline-none focus:border-accent transition-all text-primary font-serif italic text-sm md:text-base"
                      placeholder="+44 20 7123 4567"
                      value={details.phone}
                      onChange={e => setDetails({...details, phone: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5 md:space-y-6">
                <p className="text-sm md:text-base font-black uppercase tracking-widest text-ink/80 ml-4">Payment Method</p>
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
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-primary/40">White-Glove Shipping</span>
                    <span className="text-sm font-serif italic text-primary">${shippingFee.toLocaleString()}</span>
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

const Footer = ({ onNewsletterSubmit, showSuccess, featuredImageUrl }: { onNewsletterSubmit: (e: React.FormEvent) => void, showSuccess: boolean, featuredImageUrl: string }) => (
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-20 mb-24">
        <div className="col-span-1 md:col-span-2 space-y-8">
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
            Est. 1924. The global standard for authenticated elite auctions and private treaties. Built on trust, provenance, and worldwide white-glove expertise.
          </p>
        </div>

        <div className="space-y-6">
          <h4 className="text-base font-black uppercase tracking-widest text-primary">Catalogues</h4>
          <ul className="space-y-4 text-xs font-black uppercase tracking-widest text-ink/80">
            <li><a href="#" className="hover:text-primary transition-colors">Antiques</a></li>
            <li><a href="#" className="hover:text-primary transition-colors">Collection</a></li>
            <li><a href="#" className="hover:text-primary transition-colors">Live Auctions</a></li>
            <li><a href="#" className="hover:text-primary transition-colors">New Acquisitions</a></li>
          </ul>
        </div>

        <div className="space-y-6">
          <h4 className="text-base font-black uppercase tracking-widest text-primary">Services</h4>
          <ul className="space-y-4 text-xs font-black uppercase tracking-widest text-ink/80">
            <li><a href="#" className="hover:text-primary transition-colors">Consign</a></li>
            <li><a href="#" className="hover:text-primary transition-colors">Private Treaty</a></li>
            <li><a href="#" className="hover:text-primary transition-colors">White-Glove Delivery</a></li>
            <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
          </ul>
        </div>
      </div>

      <div className="pt-12 border-t border-primary/5 flex flex-col md:flex-row justify-between items-center gap-8 text-base font-black uppercase tracking-[0.3em] text-primary/20">
        <span>© 2024 Strawboss Elite Auctions Ltd.</span>
        <div className="flex gap-10">
          <a href="#" className="hover:text-primary transition-colors">Privacy</a>
          <a href="#" className="hover:text-primary transition-colors">Terms</a>
          <a href="#" className="hover:text-primary transition-colors">Cookies</a>
        </div>
      </div>
    </div>
  </footer>
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
  const [appError, setAppError] = useState<Error | null>(null);

  if (appError) throw appError;

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();

    const settingsRef = doc(db, 'settings', 'featured');
    return onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        setFeaturedImageUrl(doc.data().url);
      }
    }, (error) => {
      setAppError(handleFirestoreError(error, OperationType.GET, 'settings/featured'));
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            uid: u.uid,
            displayName: u.displayName || 'Anonymous Collector',
            email: u.email || '',
            photoURL: u.photoURL || '',
            role: 'user',
            favorites: [],
            bio: '',
            preferredCategories: [],
            externalCollectionUrl: '',
            location: '',
            createdAt: serverTimestamp()
          });
        }
      } else {
        setUserProfile(null);
        setFavorites([]);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      return onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data() as UserProfile;
          setUserProfile(data);
          setFavorites(data.favorites || []);
        }
      }, (error) => {
        setAppError(handleFirestoreError(error, OperationType.GET, `users/${user.uid}`));
      });
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const itemsUnsubscribe = onSnapshot(query(collection(db, 'items'), orderBy('createdAt', 'desc')), (snapshot) => {
      const i = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuctionItem));
      setItems(i);
      setLoading(false);
    }, (error) => {
      setAppError(handleFirestoreError(error, OperationType.GET, 'items'));
      setLoading(false);
    });
    return () => itemsUnsubscribe();
  }, []);

  useEffect(() => {
    if (selectedItem) {
      const reviewsUnsubscribe = onSnapshot(query(collection(db, 'items', selectedItem.id, 'reviews'), orderBy('timestamp', 'desc')), (snapshot) => {
        const r = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review));
        setReviews(r);
      }, (error) => {
        setAppError(handleFirestoreError(error, OperationType.GET, `items/${selectedItem.id}/reviews`));
      });
      return () => reviewsUnsubscribe();
    } else {
      setReviews([]);
    }
  }, [selectedItem]);

  const toggleFavorite = async (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return alert("Please sign in to save favorites.");
    
    const newFavorites = favorites.includes(itemId)
      ? favorites.filter(id => id !== itemId)
      : [...favorites, itemId];
    
    setFavorites(newFavorites);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        favorites: newFavorites
      });
    } catch (error) {
      console.error("Error updating favorites:", error);
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
      console.error("Error submitting review:", error);
      alert("Failed to submit review. Please ensure you are the verified buyer of this artifact.");
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           item.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = filterType === 'all' || 
                             (filterType === 'Trending' ? item.bidCount > 0 : (item.category === filterType || item.listingType === filterType));
      return matchesSearch && matchesCategory && item.status === 'active';
    });
  }, [items, searchQuery, filterType]);

  const favoriteItems = useMemo(() => {
    return items.filter(item => favorites.includes(item.id));
  }, [items, favorites]);

  const userConsignments = useMemo(() => {
    return items.filter(item => item.sellerUid === user?.uid);
  }, [items, user]);

  const handleConsign = async (data: any) => {
    if (!user) return alert("Please sign in to list an item.");
    
    try {
      if (editingItem) {
        const updatedItem: any = {
          title: data.title,
          description: data.description,
          listingType: data.listingType,
          category: data.category,
          images: [data.image],
        };

        if (data.listingType === 'buy-now') {
          updatedItem.price = parseFloat(data.price);
          updatedItem.currentBid = null;
        } else {
          updatedItem.currentBid = parseFloat(data.startingBid);
          updatedItem.price = null;
          // Only update endTime if it's a new duration or wasn't set
          updatedItem.endTime = Timestamp.fromDate(new Date(Date.now() + parseInt(data.duration) * 24 * 60 * 60 * 1000));
        }

        await updateDoc(doc(db, 'items', editingItem.id), updatedItem);
        setEditingItem(null);
        alert("Artifact updated successfully.");
      } else {
        const newItem = {
          title: data.title,
          description: data.description,
          listingType: data.listingType,
          category: data.category,
          price: data.listingType === 'buy-now' ? parseFloat(data.price) : null,
          currentBid: data.listingType === 'auction' ? parseFloat(data.startingBid) : null,
          bidCount: 0,
          images: [data.image],
          sellerUid: user.uid,
          sellerName: user.displayName,
          status: 'active',
          createdAt: serverTimestamp(),
          endTime: data.listingType === 'auction' ? Timestamp.fromDate(new Date(Date.now() + parseInt(data.duration) * 24 * 60 * 60 * 1000)) : null
        };

        await addDoc(collection(db, 'items'), newItem);
      }
      setView('marketplace');
    } catch (error) {
      console.error("Error listing/updating item:", error);
      alert("Failed to process your request. Please try again.");
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
    alert("Application submitted successfully. Our elite vetting team will review your credentials.");
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
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'items', id));
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleUpdateFeaturedImage = async (url: string) => {
    if (userProfile?.role !== 'admin') return;
    try {
      await setDoc(doc(db, 'settings', 'featured'), { url });
    } catch (error) {
      console.error("Error updating featured image:", error);
    }
  };

  const seedInitialData = async () => {
    if (!user) return alert("Please sign in to seed data.");
    
    const initialItems = [
      {
        title: "18th Century French Rococo Armchair",
        description: "An exquisite example of 18th-century French craftsmanship, this Rococo armchair features hand-carved walnut detailing and original silk damask upholstery. Sourced from a private estate in Lyon.",
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
        description: "A legendary timepiece of unparalleled rarity. This 1952 Patek Philippe features a perpetual calendar, moon phase indicator, and an 18k yellow gold case. Fully serviced and authenticated.",
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
        description: "A breathtaking Ming Dynasty vase with a rare sea-foam celadon glaze. Features intricate lotus scroll motifs and the official imperial kiln mark. A centerpiece for any serious collection.",
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
      }
    ];

    try {
      for (const item of initialItems) {
        await addDoc(collection(db, 'items'), item);
      }
      alert("Marketplace seeded successfully!");
    } catch (error) {
      console.error("Error seeding data:", error);
    }
  };

  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), data);
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  };

  return (
    <PayPalScriptProvider options={{ clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "test" }}>
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col selection:bg-accent selection:text-white relative overflow-x-hidden">
      {/* 3D Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[20%] h-[20%] bg-accent/5 blur-[80px] rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Navbar 
        user={user} 
        userProfile={userProfile}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-0"
            >
              <Hero 
                onExplore={() => setView('marketplace')} 
                onConsign={() => setView('sell')} 
                featuredImageUrl={featuredImageUrl}
                loading={loading}
              />

              {/* Category Section */}
              <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
                      {['Fine Art', 'Timepieces', 'Furniture', 'Jewelry', 'Manuscripts'].map((cat, index) => (
                        <motion.div
                          key={cat}
                          initial={{ opacity: 0, y: 20 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          onClick={() => {
                            setFilterType(cat);
                            setView('marketplace');
                          }}
                          className="aspect-square bg-white border border-black/5 flex flex-col items-center justify-center p-6 cursor-pointer group hover:border-primary transition-all duration-500 shadow-sm hover:shadow-xl"
                        >
                          <h4 className="text-xl md:text-2xl font-black text-primary uppercase tracking-tighter mb-2 group-hover:scale-110 transition-transform duration-500 text-center">{cat}</h4>
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Elite Selection</span>
                        </motion.div>
                      ))}
                </div>
              </section>
              
              <section className="py-32 px-8 max-w-7xl mx-auto grid md:grid-cols-3 gap-16 md:gap-24">
                {[
                  { icon: (props: any) => (
                    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  ), title: "Global Selection", desc: "Premium clothing sourced from sellers and boutiques around the world." },
                  { icon: (props: any) => (
                    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                  ), title: "Secure Payments", desc: "We accept Crypto, USD, and PayPal with secure protection for every transaction." },
                  { icon: (props: any) => (
                    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  ), title: "Verified Sellers", desc: "Every seller is verified to ensure quality and accurate representation of clothing." }
                ].map((feature, index) => (
                  <motion.div 
                    key={feature.title}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="text-center space-y-8 group"
                  >
                    <div className="w-16 h-16 bg-primary/5 text-primary flex items-center justify-center rounded-full mx-auto group-hover:bg-primary group-hover:text-white transition-all duration-500">
                      <feature.icon className="w-8 h-8" />
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-2xl font-black uppercase tracking-tight text-primary">{feature.title}</h4>
                      <p className="text-zinc-500 text-base leading-relaxed max-w-xs mx-auto">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </section>

              {/* Stats Section (Blue Bar) */}
              <section className="bg-[#2563eb] py-24 px-8">
                <div className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-12 md:gap-24 text-center">
                  {[
                    { label: "Listings", value: "500+" },
                    { label: "Sellers", value: "200+" },
                    { label: "Avg. Rating", value: "4.9" },
                    { label: "Countries", value: "50+" }
                  ].map((stat, index) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className="text-white space-y-2"
                    >
                      <div className="flex justify-center mb-4">
                        {index === 0 && <ShoppingBag className="w-8 h-8 opacity-50" />}
                        {index === 1 && <UserIcon className="w-8 h-8 opacity-50" />}
                        {index === 2 && <Star className="w-8 h-8 opacity-50" />}
                        {index === 3 && <svg className="w-8 h-8 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                      </div>
                      <h4 className="text-5xl font-black tracking-tighter">{stat.value}</h4>
                      <p className="text-sm font-black uppercase tracking-[0.3em] opacity-70">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* Newsletter Section */}
              <section className="py-32 px-8 bg-white border-b border-black/5">
                <div className="max-w-3xl mx-auto text-center space-y-12">
                  <div className="w-16 h-16 bg-primary/5 text-primary flex items-center justify-center rounded-full mx-auto">
                    <Send className="w-8 h-8" />
                  </div>
                  <div className="space-y-6">
                    <h3 className="text-4xl font-black text-primary uppercase tracking-tighter">Stay in the Loop</h3>
                    <p className="text-zinc-500 text-lg">Get the latest drops, exclusive deals, and style tips delivered to your inbox.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
                    <input 
                      type="email" 
                      placeholder="Enter your email address" 
                      className="flex-grow px-8 py-5 bg-zinc-50 border border-black/5 rounded-none focus:outline-none focus:border-primary transition-colors"
                    />
                    <button className="btn-primary px-12 py-5 whitespace-nowrap">Subscribe</button>
                  </div>
                </div>
              </section>

              <section className="py-40 px-8 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 mb-24">
                  <motion.div 
                    initial={{ opacity: 0, x: -50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="space-y-6"
                  >
                    <h3 className="text-3xl text-ink font-serif font-black uppercase tracking-tighter">CURATED <br/><span className="italic text-primary font-extralight">SELECTIONS</span></h3>
                    <p className="text-base text-ink/70 font-serif italic">Hand-picked treasures for the week of {format(new Date(), 'MMMM d')}</p>
                  </motion.div>
                  <motion.button 
                    initial={{ opacity: 0, x: 50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    onClick={() => setView('marketplace')}
                    className="group flex items-center gap-4 text-primary hover:translate-x-4 transition-all duration-500 uppercase tracking-[0.4em] text-base font-black"
                  >
                    View All Archives <ChevronRight className="w-5 h-5 group-hover:text-ink transition-colors" />
                  </motion.button>
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

              {user?.email === 'smubasshir532@gmail.com' && items.length === 0 && (
                <div className="py-20 text-center">
                  <button onClick={seedInitialData} className="btn-outline">Seed Marketplace Data</button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'marketplace' && (
            <>
              <Marketplace 
                items={filteredItems}
                totalItemsCount={items.length}
                onSeed={seedInitialData}
                user={user}
                loading={loading}
                onItemClick={(item) => {
                  setSelectedItem(item);
                  setView('detail');
                }}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filterType={filterType}
                setFilterType={setFilterType}
                favorites={favorites}
                onToggleFavorite={(id, e) => {
                  e.stopPropagation();
                  toggleFavorite(id);
                }}
              />
              <MembershipSection onApply={() => setShowMembershipModal(true)} />
            </>
          )}

          {view === 'about' && <AboutSection />}
          {view === 'membership' && <MembershipSection onApply={() => setShowMembershipModal(true)} />}

          {view === 'dashboard' && userProfile && (
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
          )}

          {view === 'sell' && (
            <ConsignmentForm 
              onCancel={() => {
                setEditingItem(null);
                setView('marketplace');
              }} 
              onSubmit={handleConsign}
              initialData={editingItem ? {
                title: editingItem.title,
                description: editingItem.description,
                listingType: editingItem.listingType,
                category: editingItem.category,
                price: editingItem.price?.toString() || '',
                startingBid: editingItem.currentBid?.toString() || '',
                duration: '7',
                image: editingItem.images[0]
              } : undefined}
            />
          )}

          {view === 'detail' && selectedItem && (
            <ItemDetail 
              item={selectedItem} 
              user={user} 
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
            />
          )}

          {view === 'admin' && user?.email === 'smubasshir532@gmail.com' && (
            <AdminPanel 
              items={items} 
              onDelete={handleDeleteItem} 
              featuredImageUrl={featuredImageUrl}
              onUpdateFeaturedImage={handleUpdateFeaturedImage}
              loading={loading}
              onAdd={() => {
                setEditingItem(null);
                setShowConsignModal(true);
              }}
              onEdit={(item) => {
                setEditingItem(item);
                setShowConsignModal(true);
              }}
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showConsignModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-primary/60 backdrop-blur-2xl p-4 md:p-6 overflow-y-auto">
            <div className="bg-surface w-full max-w-4xl rounded-[2.5rem] md:rounded-[4rem] shadow-[0_80px_160px_rgba(0,31,63,0.4)] border border-white/20 p-8 md:p-16 space-y-8 md:space-y-12 relative my-8">
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
                initialData={editingItem ? {
                  title: editingItem.title,
                  description: editingItem.description,
                  listingType: editingItem.listingType,
                  category: editingItem.category,
                  price: editingItem.price?.toString() || '',
                  startingBid: editingItem.currentBid?.toString() || '',
                  duration: '7',
                  image: editingItem.images[0]
                } : undefined}
              />
            </div>
          </div>
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

      <Footer onNewsletterSubmit={handleNewsletter} showSuccess={newsletterSuccess} featuredImageUrl={featuredImageUrl} />

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
    </div>
    </ErrorBoundary>
    </PayPalScriptProvider>
  );
}
