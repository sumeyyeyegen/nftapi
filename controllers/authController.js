const {promisify} = require("util")
const User = require("../models/userModel");
const catchAsync = require("../Utils/catchAsync");
const jwt = require("jsonwebtoken")
const AppError = require("../Utils/appError")
const sendEmail = require("../Utils/email");
const crypto = require("crypto")

//CREATE TOKEN
const signToken = id =>{
  return jwt.sign({id},process.env.JWT_SECRET,{
    expiresIn:process.env.JWT_EXPIRES_IN,
  })
}

const createSendToken = (user,statusCode,res) =>{
  const token = signToken(user.id || user._id);
  
  const cookieOptions = {
    expires: new Date(Date.now() + process.env.JWT_COOKIES_EXPIRE_IN*24*60*60*1000),
    // secure:true,
    httpOnly:true
  }

  // if(process.env.NODE_ENV==="production") cookieOptions.secure=true;

  res.cookie("jwt",token,cookieOptions)

  user.password = undefined;

  res.status(statusCode).json({
    status:"success",
    token,
    data:{
      user
    }
  })
}

//SIGNUP
exports.signup = catchAsync(async (req,res,next) =>{
  const newUser = await User.create(req.body);

// const newUser = await User.create({
//   name:req.body.name,
//   email:req.body.email,
//   password:req.body.password,
//   passwordConfirm: req.body.passwordConfirm
// });
createSendToken(newUser,201,res);

// const token = signToken(newUser._id);

// res.status(201).json({
//   status:"Success",
//   token,
//   data:{
//     user:newUser
//   }
// })
});

//LOGIN USER
exports.login = catchAsync(async(req,res,next) =>{
  const {email, password} = req.body;

  if(!email || !password){
   return next(new AppError("Please provide your email & password"))
  }

  const user = await User.findOne({email}).select("+password")

  if(!user || !(await user.correctPassword(password,user.password))){
return next(new AppError("Incorrect email and password",401))
  }

  // const token = signToken(user.id);
  // res.status(200).json({
  //   status:"success",
  //   token
  // })

  createSendToken(user,200,res);
});

//PROTECTING DATA
exports.protect = catchAsync(async(req,res,next) =>{
    //1 Check token
    let token;
    if(req.headers.authorization && req.headers.authorization.startsWith("Bearer")){
      token = req.headers.authorization.split(" ")[1];
      
    }
    if(!token){
      return next(new AppError("You are not logged in to get access",401));
    }
    //2 validate token
    const decoded = await promisify(jwt.verify)(token,process.env.JWT_SECRET);
    //3 user exist

    const currentUser = await User.findById(decoded.id) 
    if(!currentUser){
      return next(new AppError("The User belonging to this token no longer exist",401))
    } 
    //4 change password 
    if(currentUser.changedPasswordAfter(decoded.iat)){
      return next(
        new AppError("User recently changed the password",401)
      )
    };
    //USER WILL HAVE ACCESS THE PROTECTED DATA
    req.user = currentUser;
  next();
});

exports.restrictTo = (...roles) =>{
  return(req,res,next) =>{
    if(!roles.includes(req.user.role)){
      return next(new AppError("You have not access to delete NFT",403));
    }
    next();
  }
}

//NOW WE GOING TO WORK ON

//FORGOT PASSWORD
exports.forgotPassword = catchAsync(async(req,res,next) =>{
  // 1 Get the user based on the given email
const user = await User.findOne({email:req.body.email});
if(!user){
  return next(new AppError("There in no user with this email",404));
}
  // 2 Create a random Token
  const resetToken = user.createPasswordResetToken()
  await user.save({validateBeforeSave:false});
  // 3 Send email back to user
  const resetURL = `${req.protocol}://${req.get("host")}/api/v1/users/resetPassword/${resetToken}`;

  const message = `Forget your password? Submit a PATCH requesst with your new password and confirmPassword to: ${resetURL}.\n If didn't forget your password, please ignore this email`;
try {
  await sendEmail({
    email:user.email,
    subject:"Your password reset token(Valid for 10 min)",
    message:message
  })

  res.status(200).json({
    status:"success",
    message:"Token sent to email"
  }) 
} catch (error) {
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save({validateBeforeSave:false})

  return next(new AppError("There was an error sending the email,Try Again later",500))
}
  
})
//RESET PASSWORD
exports.resetPassword = catchAsync(async(req,res,next) =>{
  //1 Get user based on the token
  const hashedToken = crypto
  .createHash("sha256")
  .update(req.params.token)
  .digest("hex");

const user = await User.findOne({
  passwordResetToken: hashedToken,
  passwordResetExpires:{$gt:Date.now()}
})
  //2 If token has not expired, and there is user set the new password
  if(!user){
    return next(new AppError("Token is invalid or has expired",400));
  }
  //3 Update changedPassword for the user
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken=undefined;
  user.passwordResetExpires=undefined;

  await user.save();
  
  //4 Log the user in, send JWT
  // const token = signToken(user.id);
  // res.status(200).json({
  //   status:"success",
  //   message:"password updated",
  //   token
  // })

  createSendToken(user,200,res);
})

//UPDATING PASSWORD
exports.updatePassword =catchAsync(async(req,res,next) =>{
  //1 Get user from collection of data
  const user = await User.findById(req.user.id).select("+password")
  //2 Check if the posted current password is correct
  if(!(await user.correctPassword(req.body.passwordCurrent,user.password))){
    return next(new AppError("Your current password is wrong",401));
  }
  //3 If so update the password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();
  //4 log user after password change
  createSendToken(user,200,res);
});