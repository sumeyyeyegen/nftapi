const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs")
const crypto = require("crypto");

const userSchema = new mongoose.Schema({
  name:{
    type:String,
    required:[true,"Please tell us your name"]    
  },
  email : {
    type: String,
    required: [true,"Please provide your email"],
    unique: true,
    lowercase: true,
    validate:[validator.isEmail,"Please provide a valide email address"]
  },
  photo:String, 
  password:{
    type:String,
    required:[true,"Please provide a password"],
    minlength:8,
    select:false
  },
  passwordConfirm:{
    type:String,
    required:[true,"Please confirm your password"],    
    validate:{
      validator: function(item){
        return item === this.password
      },
      message:"Password is not the same"
    }
  },
  passwordChangedAt:Date,
  role:{
    type:String,
    enum:["user","creator","admin","guide"],
    default:"user"
  },
  passwordResetToken: String,
  passwordResetExpires:Date
});
//Database'e kaydedilmeden önce password şifreleme
userSchema.pre("save", async function(next){
  if(!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password,12);  
  this.passwordConfirm = undefined;  
  next();
})

userSchema.methods.correctPassword = async function(
  candidatePassword,
  userPassword
){
  return await bcrypt.compare(candidatePassword,userPassword);
}

userSchema.methods.changedPasswordAfter = function(JWTTimestamp){
  if(this.passwordChangedAt){
    const changedTimeStamp = parseInt(this.passwordChangedAt.getTime()/1000,10);
    return JWTTimestamp < changedTimeStamp;
    console.log(changedTimeStamp,JWTTimestamp);
  }

  //BY DEFAULT WE WANT TO RETURN FALSE,MANS NOT CHANGE
  return false;
} 

userSchema.methods.createPasswordResetToken = function(){
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken =  crypto
  .createHash("sha256")
  .update(resetToken)
  .digest("hex");

  console.log({resetToken},this.passwordResetToken);

  this.passwordResetExpires = Date.now() + 10 *60*1000;

  return resetToken;
}

const User = mongoose.model("User",userSchema);

module.exports = User;